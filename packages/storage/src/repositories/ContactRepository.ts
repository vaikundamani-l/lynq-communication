import type Database from 'better-sqlite3';
import { Contact, PresenceStatus } from '@lynq/core';

interface ContactRow {
  uid: string;
  username: string;
  avatar_url: string | null;
  ip_address: string;
  port: number;
  status: string;
  last_seen: number;
  device_info: string;
  is_paired: number;
  pairing_token: string | null;
  public_key: string | null;
}

export class ContactRepository {
  constructor(private db: Database.Database) {}

  public upsertContact(contact: Contact): void {
    const stmt = this.db.prepare(`
      INSERT INTO contacts (
        uid, username, avatar_url, ip_address, port,
        status, last_seen, device_info, is_paired, pairing_token, public_key
      ) VALUES (
        @uid, @username, @avatarUrl, @ipAddress, @port,
        @status, @lastSeen, @deviceInfo, @isPaired, @pairingToken, @publicKey
      )
      ON CONFLICT(uid) DO UPDATE SET
        username = excluded.username,
        avatar_url = COALESCE(excluded.avatar_url, contacts.avatar_url),
        ip_address = excluded.ip_address,
        port = excluded.port,
        status = excluded.status,
        last_seen = excluded.last_seen,
        device_info = excluded.device_info,
        is_paired = CASE WHEN contacts.is_paired = 1 THEN 1 ELSE excluded.is_paired END,
        public_key = COALESCE(excluded.public_key, contacts.public_key)
    `);

    stmt.run({
      uid: contact.uid,
      username: contact.username,
      avatarUrl: contact.avatarUrl || null,
      ipAddress: contact.ipAddress,
      port: contact.port,
      status: contact.status,
      lastSeen: contact.lastSeen,
      deviceInfo: JSON.stringify(contact.deviceInfo || {}),
      isPaired: contact.isPaired ? 1 : 0,
      pairingToken: contact.pairingToken || null,
      publicKey: contact.publicKey || null,
    });
  }

  public getContact(uid: string): Contact | null {
    const row = this.db.prepare('SELECT * FROM contacts WHERE uid = ?').get(uid) as ContactRow | undefined;
    if (!row) return null;
    return this.mapRowToContact(row);
  }

  public getAllContacts(): Contact[] {
    const rows = this.db.prepare('SELECT * FROM contacts ORDER BY username ASC').all() as ContactRow[];
    return rows.map((r) => this.mapRowToContact(r));
  }

  public updatePresence(uid: string, status: PresenceStatus, ipAddress?: string, port?: number): void {
    let sql = 'UPDATE contacts SET status = ?, last_seen = ?';
    const params: unknown[] = [status, Date.now()];

    if (ipAddress) {
      sql += ', ip_address = ?';
      params.push(ipAddress);
    }
    if (port) {
      sql += ', port = ?';
      params.push(port);
    }

    sql += ' WHERE uid = ?';
    params.push(uid);

    this.db.prepare(sql).run(...params);
  }

  public setPairingStatus(uid: string, isPaired: boolean): void {
    this.db.prepare('UPDATE contacts SET is_paired = ? WHERE uid = ?').run(isPaired ? 1 : 0, uid);
  }

  public deleteContact(uid: string): void {
    this.db.prepare('DELETE FROM contacts WHERE uid = ?').run(uid);
  }

  private mapRowToContact(row: ContactRow): Contact {
    return {
      uid: row.uid,
      username: row.username,
      avatarUrl: row.avatar_url || undefined,
      ipAddress: row.ip_address,
      port: row.port,
      status: row.status as PresenceStatus,
      lastSeen: row.last_seen,
      deviceInfo: row.device_info ? JSON.parse(row.device_info) : { deviceId: '', deviceName: '', platform: 'linux', appVersion: '0.1.0' },
      isPaired: row.is_paired === 1,
      pairingToken: row.pairing_token || undefined,
      publicKey: row.public_key || undefined,
    };
  }
}
