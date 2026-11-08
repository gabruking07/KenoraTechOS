import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function tokenDigest(token: string) { return createHmac('sha256', process.env.SESSION_SECRET || 'invalid-test-secret').update(`reset:${token}`).digest('hex'); }
function mfaKey() {
  const value = process.env.MFA_ENCRYPTION_KEY || '';
  if (!/^[a-f\d]{64}$/i.test(value)) throw new Error('MFA_ENCRYPTION_KEY must be a persistent 32-byte hex key before MFA can be enabled.');
  return Buffer.from(value, 'hex');
}
export function encryptMfaSecret(secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', mfaKey(), iv), encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
export function decryptMfaSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split('.'); if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Stored MFA secret is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', mfaKey(), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(bytes: Buffer) { let bits = 0, value = 0, out = ''; for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += alphabet[(value << (5 - bits)) & 31]; return out; }
function base32Decode(text: string) { let bits = 0, value = 0; const out: number[] = []; for (const char of text.replace(/=+$/,'').toUpperCase()) { const idx = alphabet.indexOf(char); if (idx < 0) throw new Error('Invalid MFA secret.'); value = (value << 5) | idx; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
export function newTotpSecret() { return base32Encode(randomBytes(20)); }
export function totp(secret: string, counter = Math.floor(Date.now() / 30_000)) {
  const counterBytes = Buffer.alloc(8); counterBytes.writeBigUInt64BE(BigInt(counter)); const digest = createHmac('sha1', base32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 15, number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000; return String(number).padStart(6, '0');
}
export function verifyTotp(secret: string, code: string, now = Date.now()) { if (!/^\d{6}$/.test(code)) return false; const current = Math.floor(now / 30_000); for (const step of [-1,0,1]) { const expected = Buffer.from(totp(secret, current + step)); const provided = Buffer.from(code); if (expected.length === provided.length && timingSafeEqual(expected, provided)) return true; } return false; }
export function recoveryCodeHash(code: string) { return createHmac('sha256', mfaKey()).update(`recovery:${code}`).digest('hex'); }
export function publicSessionKey(sessionId: string) { return createHmac('sha256', process.env.SESSION_SECRET || 'invalid-test-secret').update(`session:${sessionId}`).digest('base64url'); }
export function randomResetToken() { return randomBytes(32).toString('base64url'); }
export function randomRecoveryCodes(count = 10) { return Array.from({ length: count }, () => `${randomBytes(6).toString('hex').toUpperCase()}-${randomBytes(6).toString('hex').toUpperCase()}`); }
export function safeEqualHash(value: string, hash: string) { const candidate = Buffer.from(recoveryCodeHash(value)); const expected = Buffer.from(hash); return candidate.length === expected.length && timingSafeEqual(candidate, expected); }
export function passwordIsStrong(password: string) { return password.length >= 12 && password.length <= 200 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password); }
