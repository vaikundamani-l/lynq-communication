import { EventEmitter } from 'node:events';
import { Message, SignalingEnvelope, generateUUID } from '@lynq/core';
import { MessageRepository } from '@lynq/storage';
import { SignalingServer } from '../signaling/SignalingServer.js';

export interface QueueManagerOptions {
  senderId: string;
  retryIntervalMs?: number;
  maxPendingAgeMs?: number;
}

export class MessageQueueManager extends EventEmitter {
  private senderId: string;
  private retryIntervalMs: number;
  private maxPendingAgeMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private messageRepo: MessageRepository,
    private signalingServer: SignalingServer,
    options: QueueManagerOptions
  ) {
    super();
    this.senderId = options.senderId;
    this.retryIntervalMs = options.retryIntervalMs || 4000;
    this.maxPendingAgeMs = options.maxPendingAgeMs || 60000;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timer = setInterval(() => {
      this.flushAllConnectedPeers();
      this.messageRepo.markFailedMessages(this.maxPendingAgeMs);
    }, this.retryIntervalMs);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Enqueues an outgoing message, saves it locally as 'pending',
   * and attempts immediate transmission if the recipient is connected.
   */
  public enqueue(message: Message): Message {
    message.status = 'pending';
    this.messageRepo.saveMessage(message);

    this.attemptDispatch(message);
    return message;
  }

  /**
   * Automatically flushes pending messages when a peer connects or is discovered.
   */
  public drainOutboxForPeer(peerUid: string): number {
    const pending = this.messageRepo.getPendingOutgoingMessages(peerUid);
    let dispatchedCount = 0;

    for (const msg of pending) {
      const sent = this.attemptDispatch(msg);
      if (sent) dispatchedCount++;
    }

    return dispatchedCount;
  }

  private flushAllConnectedPeers(): void {
    const connectedClients = this.signalingServer.getConnectedClients();
    for (const peerUid of connectedClients) {
      this.drainOutboxForPeer(peerUid);
    }
  }

  private attemptDispatch(msg: Message): boolean {
    const envelope: SignalingEnvelope<Message> = {
      id: generateUUID(),
      type: 'msg:send',
      senderId: this.senderId,
      recipientId: msg.receiverId,
      timestamp: Date.now(),
      payload: msg,
    };

    const sent = this.signalingServer.sendToClient(msg.receiverId, envelope);
    if (sent) {
      msg.status = 'sent';
      this.messageRepo.updateMessageStatus(msg.id, 'sent');
      this.emit('messageDispatched', msg);
      return true;
    }
    return false;
  }

  /**
   * Manual retry for a failed message.
   */
  public retryMessage(messageId: string): boolean {
    const msg = this.messageRepo.getMessageById(messageId);
    if (!msg) return false;

    this.messageRepo.retryFailedMessage(messageId);
    msg.status = 'pending';
    return this.attemptDispatch(msg);
  }
}
