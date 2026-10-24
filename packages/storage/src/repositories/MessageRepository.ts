import type Database from 'better-sqlite3';
import { Message, MessageStatus } from '@lynq/core';

interface MessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  conversation_id: string;
  conversation_type: string;
  type: string;
  content: string;
  timestamp: number;
  status: string;
  reply_to_id: string | null;
  forwarded_from_id: string | null;
  reactions: string;
  is_edited: number;
  edited_at: number | null;
  is_deleted: number;
  is_pinned: number;
  file_metadata: string | null;
}

export class MessageRepository {
  constructor(private db: Database.Database) {}

  public saveMessage(msg: Message): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, sender_id, receiver_id, conversation_id, conversation_type,
        type, content, timestamp, status, reply_to_id, forwarded_from_id,
        reactions, is_edited, edited_at, is_deleted, is_pinned, file_metadata
      ) VALUES (
        @id, @senderId, @receiverId, @conversationId, @conversationType,
        @type, @content, @timestamp, @status, @replyToId, @forwardedFromId,
        @reactions, @isEdited, @editedAt, @isDeleted, @isPinned, @fileMetadata
      )
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        status = excluded.status,
        reactions = excluded.reactions,
        is_edited = excluded.is_edited,
        edited_at = excluded.edited_at,
        is_deleted = excluded.is_deleted,
        is_pinned = excluded.is_pinned,
        file_metadata = excluded.file_metadata
    `);

    stmt.run({
      id: msg.id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      conversationId: msg.conversationId,
      conversationType: msg.conversationType,
      type: msg.type,
      content: msg.content,
      timestamp: msg.timestamp,
      status: msg.status,
      replyToId: msg.replyToId || null,
      forwardedFromId: msg.forwardedFromId || null,
      reactions: JSON.stringify(msg.reactions || {}),
      isEdited: msg.isEdited ? 1 : 0,
      editedAt: msg.editedAt || null,
      isDeleted: msg.isDeleted ? 1 : 0,
      isPinned: msg.isPinned ? 1 : 0,
      fileMetadata: msg.fileMetadata ? JSON.stringify(msg.fileMetadata) : null,
    });
  }

  public getMessageById(id: string): Message | null {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
    if (!row) return null;
    return this.mapRowToMessage(row);
  }

  public getRecentMessages(limit: number = 200): Message[] {
    const rows = this.db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?').all(limit) as MessageRow[];
    return rows.reverse().map((r) => this.mapRowToMessage(r));
  }

  public getConversationMessages(
    conversationId: string,
    limit: number = 50,
    beforeTimestamp?: number
  ): Message[] {
    let query = 'SELECT * FROM messages WHERE conversation_id = ?';
    const params: unknown[] = [conversationId];

    if (beforeTimestamp) {
      query += ' AND timestamp < ?';
      params.push(beforeTimestamp);
    }

    query += ' ORDER BY timestamp ASC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as MessageRow[];
    return rows.map((r) => this.mapRowToMessage(r));
  }

  public updateMessageStatus(id: string, status: MessageStatus): void {
    this.db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, id);
  }

  public updateReactions(messageId: string, reactions: Record<string, string[]>): void {
    this.db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), messageId);
  }

  public editMessage(messageId: string, newContent: string, editedAt: number = Date.now()): void {
    this.db.prepare(`
      UPDATE messages 
      SET content = ?, is_edited = 1, edited_at = ? 
      WHERE id = ? AND is_deleted = 0
    `).run(newContent, editedAt, messageId);
  }

  public deleteMessage(messageId: string): void {
    this.db.prepare(`
      UPDATE messages 
      SET is_deleted = 1, content = 'This message was deleted' 
      WHERE id = ?
    `).run(messageId);
  }

  public pinMessage(messageId: string, isPinned: boolean): void {
    this.db.prepare('UPDATE messages SET is_pinned = ? WHERE id = ?').run(isPinned ? 1 : 0, messageId);
  }

  public searchMessages(searchQuery: string, conversationId?: string): Message[] {
    let sql = 'SELECT * FROM messages WHERE is_deleted = 0 AND content LIKE ?';
    const params: unknown[] = [`%${searchQuery}%`];

    if (conversationId) {
      sql += ' AND conversation_id = ?';
      params.push(conversationId);
    }

    sql += ' ORDER BY timestamp DESC LIMIT 100';
    const rows = this.db.prepare(sql).all(...params) as MessageRow[];
    return rows.map((r) => this.mapRowToMessage(r));
  }

  public getPendingOutgoingMessages(recipientId?: string): Message[] {
    let sql = "SELECT * FROM messages WHERE status = 'pending' AND is_deleted = 0";
    const params: unknown[] = [];

    if (recipientId) {
      sql += ' AND receiver_id = ?';
      params.push(recipientId);
    }

    sql += ' ORDER BY timestamp ASC';
    const rows = this.db.prepare(sql).all(...params) as MessageRow[];
    return rows.map((r) => this.mapRowToMessage(r));
  }

  public markFailedMessages(maxAgeMs: number = 60000): number {
    const threshold = Date.now() - maxAgeMs;
    const result = this.db.prepare(`
      UPDATE messages 
      SET status = 'failed' 
      WHERE status = 'pending' AND timestamp < ?
    `).run(threshold);
    return result.changes;
  }

  public retryFailedMessage(id: string): void {
    this.db.prepare("UPDATE messages SET status = 'pending', timestamp = ? WHERE id = ?").run(Date.now(), id);
  }

  public getUnreadCount(conversationId: string, currentUserId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM messages 
      WHERE conversation_id = ? 
        AND sender_id != ? 
        AND status != 'read'
        AND is_deleted = 0
    `).get(conversationId, currentUserId) as { count: number };

    return row ? row.count : 0;
  }

  private mapRowToMessage(row: MessageRow): Message {
    return {
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      conversationId: row.conversation_id,
      conversationType: row.conversation_type as 'direct' | 'group',
      type: row.type as 'text' | 'file' | 'voice' | 'system',
      content: row.content,
      timestamp: row.timestamp,
      status: row.status as MessageStatus,
      replyToId: row.reply_to_id || undefined,
      forwardedFromId: row.forwarded_from_id || undefined,
      reactions: row.reactions ? JSON.parse(row.reactions) : {},
      isEdited: row.is_edited === 1,
      editedAt: row.edited_at || undefined,
      isDeleted: row.is_deleted === 1,
      isPinned: row.is_pinned === 1,
      fileMetadata: row.file_metadata ? JSON.parse(row.file_metadata) : undefined,
    };
  }
}
