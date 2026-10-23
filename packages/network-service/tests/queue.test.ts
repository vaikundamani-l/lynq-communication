import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageQueueManager } from '../src/queue/MessageQueueManager.js';
import { DatabaseManager, MessageRepository } from '@lynq/storage';
import { SignalingServer } from '../src/signaling/SignalingServer.js';
import { Message, generateUUID, SignalingEnvelope } from '@lynq/core';

describe('MessageQueueManager (Store-and-Forward & Deduplication)', () => {
  let dbManager: DatabaseManager;
  let messageRepo: MessageRepository;
  let queueManager: MessageQueueManager;
  let mockSignaling: Partial<SignalingServer>;
  let sentEnvelopes: SignalingEnvelope[] = [];
  let connectedClients: string[] = [];

  beforeEach(() => {
    dbManager = new DatabaseManager(':memory:');
    messageRepo = new MessageRepository(dbManager.getRawDb());
    sentEnvelopes = [];
    connectedClients = [];

    mockSignaling = {
      sendToClient: vi.fn((recipientId: string, envelope: SignalingEnvelope) => {
        if (connectedClients.includes(recipientId)) {
          sentEnvelopes.push(envelope);
          return true;
        }
        return false;
      }),
      getConnectedClients: vi.fn(() => connectedClients),
    };

    queueManager = new MessageQueueManager(
      messageRepo,
      mockSignaling as SignalingServer,
      {
        senderId: 'alice',
        retryIntervalMs: 50,
        maxPendingAgeMs: 500,
      }
    );
  });

  afterEach(() => {
    queueManager.stop();
    dbManager.close();
  });

  it('stores message as pending when recipient is offline', () => {
    const msg: Message = {
      id: generateUUID(),
      senderId: 'alice',
      receiverId: 'bob_offline',
      conversationId: 'alice_bob',
      conversationType: 'direct',
      type: 'text',
      content: 'Offline message for Bob',
      timestamp: Date.now(),
      status: 'pending',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    queueManager.enqueue(msg);

    const saved = messageRepo.getMessageById(msg.id);
    expect(saved).not.toBeNull();
    expect(saved?.status).toBe('pending');
    expect(sentEnvelopes).toHaveLength(0);
  });

  it('automatically drains outbox when peer comes online and prevents duplicates', () => {
    const msgId = generateUUID();
    const msg: Message = {
      id: msgId,
      senderId: 'alice',
      receiverId: 'bob_online',
      conversationId: 'alice_bob',
      conversationType: 'direct',
      type: 'text',
      content: 'Pending message 1',
      timestamp: Date.now(),
      status: 'pending',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    // 1. Enqueue while Bob is offline
    queueManager.enqueue(msg);
    expect(messageRepo.getMessageById(msgId)?.status).toBe('pending');

    // 2. Bob connects!
    connectedClients.push('bob_online');

    // 3. Trigger outbox drain
    const dispatched = queueManager.drainOutboxForPeer('bob_online');
    expect(dispatched).toBe(1);
    expect(sentEnvelopes).toHaveLength(1);
    expect(messageRepo.getMessageById(msgId)?.status).toBe('sent');

    // 4. Test deduplication: Bob receives and saves the message idempotently
    messageRepo.saveMessage(msg);
    // Saving again with updated status
    msg.status = 'delivered';
    messageRepo.saveMessage(msg);

    const history = messageRepo.getConversationMessages('alice_bob');
    expect(history).toHaveLength(1); // exactly 1, no duplicate rows!
    expect(history[0].status).toBe('delivered');
  });

  it('marks expired pending messages as failed and supports retry', async () => {
    const msgId = generateUUID();
    const msg: Message = {
      id: msgId,
      senderId: 'alice',
      receiverId: 'unreachable_peer',
      conversationId: 'alice_unreachable',
      conversationType: 'direct',
      type: 'text',
      content: 'Will fail soon',
      timestamp: Date.now() - 1000, // 1 sec old, exceeds maxPendingAgeMs (500ms)
      status: 'pending',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    messageRepo.saveMessage(msg);

    // Run expiration check
    messageRepo.markFailedMessages(500);
    expect(messageRepo.getMessageById(msgId)?.status).toBe('failed');

    // Peer comes online and user clicks retry
    connectedClients.push('unreachable_peer');
    const retried = queueManager.retryMessage(msgId);
    expect(retried).toBe(true);
    expect(messageRepo.getMessageById(msgId)?.status).toBe('sent');
  });
});
