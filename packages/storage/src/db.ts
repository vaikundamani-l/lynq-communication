import Database from 'better-sqlite3';
import { runMigrations } from './migrations/index.js';

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    // Enable WAL mode for high concurrency & ultra-fast local disk writes (except in memory)
    if (dbPath !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init() {
    runMigrations(this.db);
  }

  public getRawDb(): Database.Database {
    return this.db;
  }

  public isOpen(): boolean {
    return Boolean(this.db && this.db.open);
  }

  public close(): void {
    if (this.db && this.db.open) {
      this.db.close();
    }
  }
}
