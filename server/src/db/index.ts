import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: DatabaseSync | null = null;

export function getDb(dbPath: string) {
  if (!dbInstance) {
    mkdirSync(dirname(dbPath), { recursive: true });
    sqliteInstance = new DatabaseSync(dbPath);
    sqliteInstance.exec('PRAGMA journal_mode = WAL');
    sqliteInstance.exec('PRAGMA foreign_keys = ON');
    dbInstance = drizzle({ client: sqliteInstance, schema });
  }
  return dbInstance;
}

export function getSqlite() {
  if (!sqliteInstance) throw new Error('DB not initialized');
  return sqliteInstance;
}

export { schema };
