import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(secretOverride?: string): Buffer {
  const raw = secretOverride || env.TOKEN_ENCRYPTION_KEY;
  // Derive a guaranteed 32-byte key via SHA-256 so any 32+ char string or 64-char hex works cleanly
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * Encrypts sensitive strings (e.g., GitHub OAuth access tokens, webhook secrets)
 * using AES-256-GCM with a unique random 96-bit IV per value.
 */
export function encryptSecret(plaintext: string, keyOverride?: string): string {
  const key = getEncryptionKey(keyOverride);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts values produced by encryptSecret.
 */
export function decryptSecret(ciphertext: string, keyOverride?: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey(keyOverride);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Verifies GitHub webhook HMAC-SHA256 signature (`X-Hub-Signature-256`) using timing-safe comparison.
 */
export function verifyGitHubWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expected = Buffer.from(`sha256=${expectedHex}`, 'utf8');
  const actual = Buffer.from(signatureHeader, 'utf8');

  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Generates a cryptographically strong random hex string (e.g., for per-repo webhook secrets).
 */
export function generateSecureRandomHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Computes a deterministic SHA-256 fingerprint for finding deduplication.
 */
export function computeFingerprint(parts: Array<string | number>): string {
  return crypto
    .createHash('sha256')
    .update(parts.map(String).join('|'))
    .digest('hex')
    .slice(0, 24);
}
