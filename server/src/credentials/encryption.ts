import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { appConfig } from '../config.js';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  return scryptSync(appConfig.masterEncryptionKey, 'signal-terminal-salt', 32);
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function keyHint(key: string): string {
  return key.length <= 4 ? key : key.slice(-4);
}
