import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  // Migration tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const row = db.prepare('SELECT MAX(version) as current_version FROM schema_migrations').get() as {
    current_version: number | null;
  };
  const currentVersion = row?.current_version || 0;

  if (currentVersion < 1) {
    applyMigrationV1(db);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, Date.now());
  }
}

function applyMigrationV1(db: Database.Database): void {
  db.exec(`
    -- Messages Table
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      conversation_type TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      status TEXT NOT NULL,
      reply_to_id TEXT,
      forwarded_from_id TEXT,
      reactions TEXT DEFAULT '{}',
      is_edited INTEGER DEFAULT 0,
      edited_at INTEGER,
      is_deleted INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      file_metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp ASC);
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

    -- Contacts Table
    CREATE TABLE IF NOT EXISTS contacts (
      uid TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      avatar_url TEXT,
      ip_address TEXT NOT NULL,
      port INTEGER NOT NULL,
      status TEXT NOT NULL,
      last_seen INTEGER NOT NULL,
      device_info TEXT NOT NULL,
      is_paired INTEGER DEFAULT 0,
      pairing_token TEXT,
      public_key TEXT
    );

    -- Groups Table
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      avatar_url TEXT,
      creator_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      pinned_message_ids TEXT DEFAULT '[]'
    );

    -- Group Members Table
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    -- File Transfers Table
    CREATE TABLE IF NOT EXISTS file_transfers (
      transfer_id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      sha256_hash TEXT NOT NULL,
      chunk_size INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL,
      transferred_chunks INTEGER NOT NULL,
      transferred_bytes INTEGER NOT NULL,
      direction TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      status TEXT NOT NULL,
      speed_bps REAL NOT NULL,
      eta_seconds INTEGER NOT NULL,
      save_path TEXT,
      error TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    -- Settings / Key-Value Store
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
