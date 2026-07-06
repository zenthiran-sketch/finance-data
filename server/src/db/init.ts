import { appConfig } from '../config.js';
import { getDb } from './index.js';
import { runMigrations } from './migrations.js';

export function initDb() {
  getDb(appConfig.databasePath);
  runMigrations();
}

export { runMigrations };
