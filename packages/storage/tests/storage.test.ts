import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DatabaseManager,
  MessageRepository,
  ContactRepository,
  GroupRepository,
  SettingsRepository,
} from '../src/index.js';
import { Message, Contact, Group, generateUUID } from '@lynq/core';

describe('@lynq/storage tests', () => {
  let dbManager: DatabaseManager;
  let messageRepo: MessageRepository;
  let contactRepo: ContactRepository;
  let groupRepo: GroupRepository;
  let settingsRepo: SettingsRepository;

  beforeEach(() => {
    dbManager = new DatabaseManager(':memory:');
    const rawDb = dbManager.getRawDb();
    messageRepo = new MessageRepository(rawDb);
    contactRepo = new ContactRepository(rawDb);
    groupRepo = new GroupRepository(rawDb);
    settingsRepo = new SettingsRepository(rawDb);
  });

  afterEach(() => {
    dbManager.close();
  });

  describe('MessageRepository', () => {
    it('saves a message and retrieves it by id', () => {
      const msg: Message = {
        id: generateUUID(),
        senderId: 'alice',
        receiverId: 'bob',
        conversationId: 'conv_alice_bob',
        conversationType: 'direct',
        type: 'text',
        content: 'Hey Bob, how are you?',
        timestamp: Date.now(),
        status: 'sent',
        reactions: {},
        isEdited: false,
        isDeleted: false,
        isPinned: false,
      };

      messageRepo.saveMessage(msg);
      const retrieved = messageRepo.getMessageById(msg.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(msg.id);
      expect(retrieved?.content).toBe(msg.content);
      expect(retrieved?.status).toBe('sent');
    });

    it('handles idempotent message saving (prevents duplicates on reconnect)', () => {
      const msgId = generateUUID();
      const msg: Message = {
        id: msgId,
        senderId: 'alice',
        receiverId: 'bob',
        conversationId: 'conv_1',
        conversationType: 'direct',
        type: 'text',
        content: 'Idempotent text',
        timestamp: Date.now(),
        status: 'pending',
        reactions: {},
        isEdited: false,
        isDeleted: false,
        isPinned: false,
      };

      messageRepo.saveMessage(msg);
      // Re-save exact same message with updated status
      msg.status = 'delivered';
      messageRepo.saveMessage(msg);

      const list = messageRepo.getConversationMessages('conv_1');
      expect(list).toHaveLength(1);
      expect(list[0].status).toBe('delivered');
    });

    it('updates status, edits, reacts, and soft-deletes messages', () => {
      const msgId = generateUUID();
      const msg: Message = {
        id: msgId,
        senderId: 'alice',
        receiverId: 'bob',
        conversationId: 'conv_edit_test',
        conversationType: 'direct',
        type: 'text',
        content: 'Original message',
        timestamp: 1000,
        status: 'sent',
        reactions: {},
        isEdited: false,
        isDeleted: false,
        isPinned: false,
      };

      messageRepo.saveMessage(msg);

      // Status update
      messageRepo.updateMessageStatus(msgId, 'read');
      expect(messageRepo.getMessageById(msgId)?.status).toBe('read');

      // Edit
      messageRepo.editMessage(msgId, 'Edited message text', 2000);
      const edited = messageRepo.getMessageById(msgId);
      expect(edited?.content).toBe('Edited message text');
      expect(edited?.isEdited).toBe(true);

      // Reactions
      messageRepo.updateReactions(msgId, { '👍': ['bob'] });
      expect(messageRepo.getMessageById(msgId)?.reactions).toEqual({ '👍': ['bob'] });

      // Search
      const searchRes = messageRepo.searchMessages('Edited');
      expect(searchRes).toHaveLength(1);
      expect(searchRes[0].id).toBe(msgId);

      // Pin
      messageRepo.pinMessage(msgId, true);
      expect(messageRepo.getMessageById(msgId)?.isPinned).toBe(true);

      // Soft delete
      messageRepo.deleteMessage(msgId);
      const deleted = messageRepo.getMessageById(msgId);
      expect(deleted?.isDeleted).toBe(true);
      expect(deleted?.content).toBe('This message was deleted');
    });

    it('calculates unread message counts accurately', () => {
      const convId = 'conv_unread_test';
      const m1: Message = {
        id: generateUUID(),
        senderId: 'alice',
        receiverId: 'bob',
        conversationId: convId,
        conversationType: 'direct',
        type: 'text',
        content: 'Hi',
        timestamp: 100,
        status: 'delivered',
        reactions: {},
        isEdited: false,
        isDeleted: false,
        isPinned: false,
      };
      const m2: Message = {
        id: generateUUID(),
        senderId: 'alice',
        receiverId: 'bob',
        conversationId: convId,
        conversationType: 'direct',
        type: 'text',
        content: 'Are you there?',
        timestamp: 200,
        status: 'delivered',
        reactions: {},
        isEdited: false,
        isDeleted: false,
        isPinned: false,
      };

      messageRepo.saveMessage(m1);
      messageRepo.saveMessage(m2);

      // For bob, there are 2 unread messages
      expect(messageRepo.getUnreadCount(convId, 'bob')).toBe(2);

      // Mark first as read
      messageRepo.updateMessageStatus(m1.id, 'read');
      expect(messageRepo.getUnreadCount(convId, 'bob')).toBe(1);

      // For alice (the sender), unread count should be 0
      expect(messageRepo.getUnreadCount(convId, 'alice')).toBe(0);
    });
  });

  describe('ContactRepository', () => {
    it('upserts and retrieves contacts', () => {
      const contact: Contact = {
        uid: 'user_bob',
        username: 'Bob Ross',
        ipAddress: '192.168.1.50',
        port: 8080,
        status: 'online',
        lastSeen: Date.now(),
        deviceInfo: {
          deviceId: 'dev_123',
          deviceName: "Bob's ThinkPad",
          platform: 'linux',
          appVersion: '0.1.0',
        },
        isPaired: false,
      };

      contactRepo.upsertContact(contact);
      const retrieved = contactRepo.getContact('user_bob');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.username).toBe('Bob Ross');
      expect(retrieved?.status).toBe('online');
      expect(retrieved?.isPaired).toBe(false);

      // Update presence
      contactRepo.updatePresence('user_bob', 'away');
      expect(contactRepo.getContact('user_bob')?.status).toBe('away');

      // Set paired
      contactRepo.setPairingStatus('user_bob', true);
      expect(contactRepo.getContact('user_bob')?.isPaired).toBe(true);
    });
  });

  describe('GroupRepository', () => {
    it('creates group with members and retrieves it', () => {
      const group: Group = {
        id: 'grp_team_alpha',
        name: 'Team Alpha',
        description: 'Local development team',
        creatorId: 'alice',
        members: [
          { userId: 'alice', username: 'Alice', role: 'creator', joinedAt: 100 },
          { userId: 'bob', username: 'Bob', role: 'member', joinedAt: 105 },
        ],
        createdAt: 100,
        updatedAt: 105,
        pinnedMessageIds: [],
      };

      groupRepo.createGroup(group);
      const retrieved = groupRepo.getGroup('grp_team_alpha');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Team Alpha');
      expect(retrieved?.members).toHaveLength(2);

      // Add a third member
      groupRepo.addMember('grp_team_alpha', {
        userId: 'charlie',
        username: 'Charlie',
        role: 'member',
        joinedAt: 110,
      });

      const updated = groupRepo.getGroup('grp_team_alpha');
      expect(updated?.members).toHaveLength(3);
    });
  });

  describe('SettingsRepository', () => {
    it('sets and gets settings values', () => {
      settingsRepo.set('theme', 'dark');
      settingsRepo.set('download_dir', '/home/user/Downloads/LYNQ');

      expect(settingsRepo.get('theme')).toBe('dark');
      expect(settingsRepo.get('download_dir')).toBe('/home/user/Downloads/LYNQ');
      expect(settingsRepo.get('non_existent', 'default_val')).toBe('default_val');
    });
  });
});
