import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

export const appConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  databasePath: process.env.DATABASE_PATH || resolve(__dirname, '../../data/signal-terminal.db'),
  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY || 'dev-key-change-in-production-32b',
  fastRefreshMs: parseInt(process.env.FAST_REFRESH_MS || '60000', 10),
  mediumRefreshMs: parseInt(process.env.MEDIUM_REFRESH_MS || '21600000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
