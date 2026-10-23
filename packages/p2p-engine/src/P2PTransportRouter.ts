import {
  Message,
  MessageAck,
  TypingIndicator,
  SignalingEnvelope,
  generateUUID,
} from '@lynq/core';
import { LynqPeerConnection, PeerConnectionState } from './PeerConnection.js';

export interface TransportSender {
  sendSignalingEnvelope: (envelope: SignalingEnvelope) => boolean;
}

export class P2PTransportRouter {
  private peers = new Map<string, LynqPeerConnection>();

  constructor(
    private myUid: string,
    private signalingSender: TransportSender
  ) {}

  public getOrCreateConnection(
    peerUid: string,
    callbacks: {
      onMessage: (msg: Message) => void;
      onAck: (ack: MessageAck) => void;
      onReadReceipt: (receipt: { messageId: string; readerId: string; timestamp: number }) => void;
      onTyping: (typing: TypingIndicator) => void;
      onReaction: (reaction: { messageId: string; userId: string; emoji: string; action: 'add' | 'remove' }) => void;
      onEdit: (edit: { messageId: string; content: string; editedAt: number }) => void;
      onDelete: (del: { messageId: string }) => void;
      onStateChange?: (state: PeerConnectionState) => void;
    }
  ): LynqPeerConnection {
    let conn = this.peers.get(peerUid);
    if (!conn) {
      conn = new LynqPeerConnection(this.myUid, peerUid, {
        ...callbacks,
        onStateChange: (state) => {
          callbacks.onStateChange?.(state);
        },
        onSignalNeeded: (envelope) => {
          this.signalingSender.sendSignalingEnvelope(envelope);
        },
      });
      this.peers.set(peerUid, conn);
    }
    return conn;
  }

  public routeMessage(recipientId: string, message: Message): 'direct_datachannel' | 'signaling_relay' | 'failed' {
    const conn = this.peers.get(recipientId);
    if (conn && conn.isDirectReady()) {
      const sent = conn.sendMessage(message);
      if (sent) return 'direct_datachannel';
    }

    // Fallback to signaling server
    const envelope: SignalingEnvelope<Message> = {
      id: generateUUID(),
      type: 'msg:send',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: message,
    };

    const sentRelay = this.signalingSender.sendSignalingEnvelope(envelope);
    return sentRelay ? 'signaling_relay' : 'failed';
  }

  public routeTyping(recipientId: string, conversationId: string, isTyping: boolean): void {
    const conn = this.peers.get(recipientId);
    if (conn && conn.isDirectReady()) {
      conn.sendTyping(conversationId, isTyping);
      return;
    }

    const envelope: SignalingEnvelope<TypingIndicator> = {
      id: generateUUID(),
      type: 'msg:typing',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: {
        conversationId,
        userId: this.myUid,
        isTyping,
        timestamp: Date.now(),
      },
    };
    this.signalingSender.sendSignalingEnvelope(envelope);
  }

  public routeReadReceipt(recipientId: string, messageId: string): void {
    const conn = this.peers.get(recipientId);
    if (conn && conn.isDirectReady()) {
      conn.sendReadReceipt(messageId);
      return;
    }

    const envelope: SignalingEnvelope = {
      id: generateUUID(),
      type: 'msg:ack',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: {
        messageId,
        status: 'read',
        recipientId: this.myUid,
        timestamp: Date.now(),
      },
    };
    this.signalingSender.sendSignalingEnvelope(envelope);
  }

  public routeReaction(
    recipientId: string,
    messageId: string,
    emoji: string,
    action: 'add' | 'remove'
  ): void {
    const conn = this.peers.get(recipientId);
    if (conn && conn.isDirectReady()) {
      conn.sendReaction(messageId, emoji, action);
      return;
    }

    const envelope: SignalingEnvelope = {
      id: generateUUID(),
      type: 'msg:react',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: {
        messageId,
        userId: this.myUid,
        emoji,
        action,
      },
    };
    this.signalingSender.sendSignalingEnvelope(envelope);
  }

  public routeEdit(recipientId: string, messageId: string, newContent: string): void {
    const conn = this.peers.get(recipientId);
    if (conn && conn.isDirectReady()) {
      conn.sendEdit(messageId, newContent);
      return;
    }

    const envelope: SignalingEnvelope = {
      id: generateUUID(),
      type: 'msg:edit',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: {
        messageId,
        content: newContent,
        editedAt: Date.now(),
      },
    };
    this.signalingSender.sendSignalingEnvelope(envelope);
  }

  public routeDelete(recipientId: string, messageId: string): void {
    const conn = this.peers.get(recipientId);
    if (conn && conn.isDirectReady()) {
      conn.sendDelete(messageId);
      return;
    }

    const envelope: SignalingEnvelope = {
      id: generateUUID(),
      type: 'msg:delete',
      senderId: this.myUid,
      recipientId,
      timestamp: Date.now(),
      payload: {
        messageId,
      },
    };
    this.signalingSender.sendSignalingEnvelope(envelope);
  }

  public closeAll(): void {
    for (const conn of this.peers.values()) {
      conn.close();
    }
    this.peers.clear();
  }
}
