// ============================================================
// Secret encryption (AES-256-GCM)
// Used for Feishu appSecret and LLM apiKey at-rest encryption.
// Dashboard encrypts on write; the (future) worker decrypts on read.
// Both share SECRET_ENCRYPTION_KEY.
// ============================================================

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

function getKey(): Buffer {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) throw new Error('SECRET_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('SECRET_ENCRYPTION_KEY must decode to 32 bytes (base64)');
  }
  return key;
}

/**
 * Encrypt a plaintext secret.
 * Returns base64( iv(12) || authTag(16) || ciphertext ).
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a value produced by encryptSecret(). */
export function decryptSecret(packed: string): string {
  const buf = Buffer.from(packed, 'base64');
  if (buf.length < 28) throw new Error('Invalid ciphertext');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/** Mask a plaintext secret for display: `sk-1••••9af2`. */
export function maskSecret(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 8) return '••••';
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}
