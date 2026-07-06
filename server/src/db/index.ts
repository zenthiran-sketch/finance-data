import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;

export function getDb(dbPath: string) {
  if (!dbInstance) {
    mkdirSync(dirname(dbPath), { recursive: true });
    sqliteInstance = new Database(dbPath);
    sqliteInstance.pragma('journal_mode = WAL');
    sqliteInstance.pragma('foreign_keys = ON');
    dbInstance = drizzle(sqliteInstance, { schema });
  }
  return dbInstance;
}

export function getSqlite() {
  if (!sqliteInstance) throw new Error('DB not initialized');
  return sqliteInstance;
}

export { schema };
