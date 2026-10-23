import type Database from 'better-sqlite3';
import { Group, GroupMember } from '@lynq/core';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  creator_id: string;
  created_at: number;
  updated_at: number;
  pinned_message_ids: string;
}

interface MemberRow {
  group_id: string;
  user_id: string;
  username: string;
  role: string;
  joined_at: number;
}

export class GroupRepository {
  constructor(private db: Database.Database) {}

  public createGroup(group: Group): void {
    const insertGroup = this.db.prepare(`
      INSERT INTO groups (id, name, description, avatar_url, creator_id, created_at, updated_at, pinned_message_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMember = this.db.prepare(`
      INSERT INTO group_members (group_id, user_id, username, role, joined_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      insertGroup.run(
        group.id,
        group.name,
        group.description || null,
        group.avatarUrl || null,
        group.creatorId,
        group.createdAt,
        group.updatedAt,
        JSON.stringify(group.pinnedMessageIds || [])
      );

      for (const m of group.members) {
        insertMember.run(group.id, m.userId, m.username, m.role, m.joinedAt);
      }
    });

    transaction();
  }

  public getGroup(id: string): Group | null {
    const row = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined;
    if (!row) return null;

    const memberRows = this.db.prepare('SELECT * FROM group_members WHERE group_id = ?').all(id) as MemberRow[];
    const members: GroupMember[] = memberRows.map((m) => ({
      userId: m.user_id,
      username: m.username,
      role: m.role as 'creator' | 'admin' | 'member',
      joinedAt: m.joined_at,
    }));

    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      avatarUrl: row.avatar_url || undefined,
      creatorId: row.creator_id,
      members,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pinnedMessageIds: row.pinned_message_ids ? JSON.parse(row.pinned_message_ids) : [],
    };
  }

  public getAllGroups(): Group[] {
    const rows = this.db.prepare('SELECT id FROM groups ORDER BY updated_at DESC').all() as { id: string }[];
    return rows.map((r) => this.getGroup(r.id)).filter((g): g is Group => g !== null);
  }

  public addMember(groupId: string, member: GroupMember): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO group_members (group_id, user_id, username, role, joined_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(groupId, member.userId, member.username, member.role, member.joinedAt);
  }

  public removeMember(groupId: string, userId: string): void {
    this.db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
  }
}
