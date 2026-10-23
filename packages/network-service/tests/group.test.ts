import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GroupManager } from '../src/group/GroupManager.js';
import { DatabaseManager, GroupRepository, MessageRepository } from '@lynq/storage';
import { MessageQueueManager } from '../src/queue/MessageQueueManager.js';
import { SignalingServer } from '../src/signaling/SignalingServer.js';
import { SignalingEnvelope, Message } from '@lynq/core';

describe('GroupManager (Group Conversations, Permissions & Fan-out Delivery)', () => {
  let dbManager: DatabaseManager;
  let groupRepo: GroupRepository;
  let messageRepo: MessageRepository;
  let queueManager: MessageQueueManager;
  let groupManager: GroupManager;
  let mockSignaling: Partial<SignalingServer>;
  let sentEnvelopes: SignalingEnvelope[] = [];

  beforeEach(() => {
    dbManager = new DatabaseManager(':memory:');
    const rawDb = dbManager.getRawDb();
    groupRepo = new GroupRepository(rawDb);
    messageRepo = new MessageRepository(rawDb);
    sentEnvelopes = [];

    mockSignaling = {
      sendToClient: vi.fn((recipientId: string, envelope: SignalingEnvelope) => {
        sentEnvelopes.push(envelope);
        return true;
      }),
      getConnectedClients: vi.fn(() => ['bob', 'charlie']),
    };

    queueManager = new MessageQueueManager(
      messageRepo,
      mockSignaling as SignalingServer,
      { senderId: 'alice' }
    );

    groupManager = new GroupManager(
      'alice',
      'Alice',
      groupRepo,
      messageRepo,
      queueManager,
      mockSignaling as SignalingServer
    );
  });

  afterEach(() => {
    queueManager.stop();
    dbManager.close();
  });

  it('creates group with creator role and notifies initial members', () => {
    const group = groupManager.createGroup('Engineering Team', 'Local development discussion', [
      { userId: 'bob', username: 'Bob' },
      { userId: 'charlie', username: 'Charlie' },
    ]);

    expect(group.id).toBeDefined();
    expect(group.name).toBe('Engineering Team');
    expect(group.members).toHaveLength(3);
    expect(group.members[0].userId).toBe('alice');
    expect(group.members[0].role).toBe('creator');

    // Bob and Charlie should be notified
    expect(mockSignaling.sendToClient).toHaveBeenCalledWith('bob', expect.anything());
    expect(mockSignaling.sendToClient).toHaveBeenCalledWith('charlie', expect.anything());
  });

  it('fans out group messages reliably to all group members', () => {
    const group = groupManager.createGroup('Design Team', 'UI/UX chat', [
      { userId: 'bob', username: 'Bob' },
      { userId: 'charlie', username: 'Charlie' },
    ]);

    sentEnvelopes = [];

    const msg = groupManager.sendGroupMessage(group.id, 'Hello everyone in Design Team!');
    expect(msg.content).toBe('Hello everyone in Design Team!');
    expect(msg.conversationType).toBe('group');

    // Message saved to local database
    const saved = messageRepo.getMessageById(msg.id);
    expect(saved).not.toBeNull();
    expect(saved?.content).toBe('Hello everyone in Design Team!');

    // Dispatched to Bob and Charlie (fan-out)
    expect(sentEnvelopes).toHaveLength(2);
    const recipients = sentEnvelopes.map((e) => (e.payload as Message).receiverId);
    expect(recipients).toContain('bob');
    expect(recipients).toContain('charlie');
  });

  it('enforces membership and admin permissions correctly', () => {
    const group = groupManager.createGroup('Private Lab', 'Secret', [
      { userId: 'bob', username: 'Bob' },
    ]);

    // Bob (regular member) attempts to add Dave -> should be rejected!
    expect(() => {
      groupManager.addMember(group.id, 'dave', 'Dave', 'bob');
    }).toThrow(/Permission denied/);

    // Alice (creator) adds Dave -> succeeds!
    groupManager.addMember(group.id, 'dave', 'Dave', 'alice');
    expect(groupRepo.getGroup(group.id)?.members).toHaveLength(3);

    // Alice promotes Bob to admin
    groupManager.promoteToAdmin(group.id, 'bob', 'alice');
    const updated = groupRepo.getGroup(group.id);
    const bobMember = updated?.members.find((m) => m.userId === 'bob');
    expect(bobMember?.role).toBe('admin');

    // Bob (admin) attempts to remove Alice (creator) -> should be rejected!
    expect(() => {
      groupManager.removeMember(group.id, 'alice', 'bob');
    }).toThrow(/creator cannot be removed/);

    // Alice pins a message in the group
    groupManager.pinGroupMessage(group.id, 'msg_pin_1', true);
    expect(groupRepo.getGroup(group.id)?.pinnedMessageIds).toContain('msg_pin_1');
  });
});
