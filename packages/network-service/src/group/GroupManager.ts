import { EventEmitter } from 'node:events';
import { Group, GroupMember, Message, generateUUID, SignalingEnvelope } from '@lynq/core';
import { GroupRepository, MessageRepository } from '@lynq/storage';
import { MessageQueueManager } from '../queue/MessageQueueManager.js';
import { SignalingServer } from '../signaling/SignalingServer.js';

export class GroupManager extends EventEmitter {
  constructor(
    private myUid: string,
    private myUsername: string,
    private groupRepo: GroupRepository,
    private messageRepo: MessageRepository,
    private queueManager: MessageQueueManager,
    private signalingServer: SignalingServer
  ) {
    super();
  }

  /**
   * Create a new group with the current user as creator.
   */
  public createGroup(
    name: string,
    description?: string,
    initialMembers: { userId: string; username: string }[] = []
  ): Group {
    const groupId = 'grp_' + generateUUID();
    const now = Date.now();

    const members: GroupMember[] = [
      {
        userId: this.myUid,
        username: this.myUsername,
        role: 'creator',
        joinedAt: now,
      },
      ...initialMembers.map((m) => ({
        userId: m.userId,
        username: m.username,
        role: 'member' as const,
        joinedAt: now,
      })),
    ];

    const group: Group = {
      id: groupId,
      name,
      description,
      creatorId: this.myUid,
      members,
      createdAt: now,
      updatedAt: now,
      pinnedMessageIds: [],
    };

    this.groupRepo.createGroup(group);

    // Notify initial members of their addition to the group
    for (const m of initialMembers) {
      if (m.userId !== this.myUid) {
        this.signalingServer.sendToClient(m.userId, {
          id: generateUUID(),
          type: 'msg:send',
          senderId: this.myUid,
          recipientId: m.userId,
          timestamp: Date.now(),
          payload: {
            id: generateUUID(),
            senderId: this.myUid,
            receiverId: m.userId,
            conversationId: groupId,
            conversationType: 'group',
            type: 'system',
            content: `You were added to group "${name}"`,
            timestamp: Date.now(),
            status: 'sent',
            reactions: {},
            isEdited: false,
            isDeleted: false,
            isPinned: false,
          },
        });
      }
    }

    this.emit('groupCreated', group);
    return group;
  }

  /**
   * Reliable fan-out group message delivery.
   * Dispatches to every active member using store-and-forward queue.
   */
  public sendGroupMessage(groupId: string, content: string, replyToId?: string): Message {
    const group = this.groupRepo.getGroup(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    const isMember = group.members.some((m: GroupMember) => m.userId === this.myUid);
    if (!isMember) {
      throw new Error(`User ${this.myUid} is not a member of group ${groupId}`);
    }

    const now = Date.now();
    const messageId = generateUUID();

    const masterMessage: Message = {
      id: messageId,
      senderId: this.myUid,
      receiverId: groupId,
      conversationId: groupId,
      conversationType: 'group',
      type: 'text',
      content,
      timestamp: now,
      status: 'sent',
      replyToId,
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    // Save master message to local SQLite
    this.messageRepo.saveMessage(masterMessage);

    // Reliable fan-out to every member in the group (excluding sender)
    for (const member of group.members) {
      if (member.userId !== this.myUid) {
        const memberCopy: Message = {
          ...masterMessage,
          receiverId: member.userId,
        };
        this.queueManager.enqueue(memberCopy);
      }
    }

    this.emit('groupMessageSent', masterMessage);
    return masterMessage;
  }

  /**
   * Add a member to the group. Enforces Admin or Creator role.
   */
  public addMember(
    groupId: string,
    targetUserId: string,
    targetUsername: string,
    callerId: string = this.myUid
  ): void {
    const group = this.groupRepo.getGroup(groupId);
    if (!group) throw new Error('Group not found');

    const caller = group.members.find((m: GroupMember) => m.userId === callerId);
    if (!caller || (caller.role !== 'creator' && caller.role !== 'admin')) {
      throw new Error('Permission denied: Only group creator or admins can add members');
    }

    const newMember: GroupMember = {
      userId: targetUserId,
      username: targetUsername,
      role: 'member',
      joinedAt: Date.now(),
    };

    this.groupRepo.addMember(groupId, newMember);
    this.emit('memberAdded', { groupId, member: newMember });
  }

  /**
   * Remove a member from the group. Enforces role hierarchy.
   */
  public removeMember(groupId: string, targetUserId: string, callerId: string = this.myUid): void {
    const group = this.groupRepo.getGroup(groupId);
    if (!group) throw new Error('Group not found');

    if (targetUserId === group.creatorId) {
      throw new Error('Permission denied: The group creator cannot be removed');
    }

    const caller = group.members.find((m: GroupMember) => m.userId === callerId);
    if (!caller || (caller.role !== 'creator' && caller.role !== 'admin')) {
      throw new Error('Permission denied: Only group creator or admins can remove members');
    }

    const target = group.members.find((m: GroupMember) => m.userId === targetUserId);
    if (caller.role === 'admin' && target?.role === 'admin' && callerId !== targetUserId) {
      throw new Error('Permission denied: Admins cannot remove other admins');
    }

    this.groupRepo.removeMember(groupId, targetUserId);
    this.emit('memberRemoved', { groupId, userId: targetUserId });
  }

  /**
   * Promote a member to admin role.
   */
  public promoteToAdmin(groupId: string, targetUserId: string, callerId: string = this.myUid): void {
    const group = this.groupRepo.getGroup(groupId);
    if (!group) throw new Error('Group not found');

    const caller = group.members.find((m: GroupMember) => m.userId === callerId);
    if (!caller || caller.role !== 'creator') {
      throw new Error('Permission denied: Only the group creator can promote admins');
    }

    this.groupRepo.updateMemberRole(groupId, targetUserId, 'admin');
    this.emit('memberPromoted', { groupId, userId: targetUserId, role: 'admin' });
  }

  /**
   * Pin a message to the group bulletin.
   */
  public pinGroupMessage(groupId: string, messageId: string, pin: boolean): void {
    this.groupRepo.pinGroupMessage(groupId, messageId, pin);
    this.emit('groupMessagePinned', { groupId, messageId, pin });
  }
}
