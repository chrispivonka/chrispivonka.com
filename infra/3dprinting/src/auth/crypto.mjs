/**
 * Cookie encryption/decryption using AES-256-GCM.
 *
 * Format: base64url( IV (12 bytes) || ciphertext || auth tag (16 bytes) )
 *
 * GCM provides authenticated encryption — integrity and confidentiality
 * in a single operation. No separate HMAC needed.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

/**
 * Base64url encode a buffer (cookie-safe, no padding).
 */
function base64urlEncode(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Base64url decode a string back to a buffer.
 */
function base64urlDecode(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return Buffer.from(b64, "base64");
}

/**
 * Encrypt a JSON-serializable payload into a cookie value.
 *
 * @param {object} payload - Data to encrypt
 * @param {Buffer} key - 32-byte AES key
 * @returns {string} base64url-encoded encrypted value
 */
export function encrypt(payload, key) {
  const iv = randomBytes(IV_LENGTH);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return base64urlEncode(Buffer.concat([iv, encrypted, tag]));
}

/**
 * Decrypt a cookie value back into a JSON object using a single key.
 *
 * @param {string} value - base64url-encoded encrypted value
 * @param {Buffer} key - 32-byte AES key
 * @returns {object|null} Decrypted payload, or null if decryption fails
 */
function decryptWithKey(value, key) {
  try {
    const raw = base64urlDecode(value);

    if (raw.length < IV_LENGTH + TAG_LENGTH + 1) return null;

    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(raw.length - TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Decrypt a cookie value, trying the current key first then previous keys.
 *
 * This supports key rotation: when you rotate the encryption key,
 * sessions encrypted with the old key remain valid until they expire.
 * New cookies are always encrypted with the current key.
 *
 * @param {string} value - base64url-encoded encrypted value
 * @param {Buffer} currentKey - Current 32-byte AES key
 * @param {Buffer[]} [previousKeys=[]] - Previous keys to try as fallback
 * @returns {object|null} Decrypted payload, or null if all keys fail
 */
export function decrypt(value, currentKey, previousKeys = []) {
  // Try current key first
  const result = decryptWithKey(value, currentKey);
  if (result) return result;

  // Try previous keys for rotation support
  for (const key of previousKeys) {
    const fallback = decryptWithKey(value, key);
    if (fallback) return fallback;
  }

  return null;
}

/**
 * Generate cryptographically random bytes, base64url-encoded.
 *
 * @param {number} length - Number of random bytes
 * @returns {string} base64url-encoded random string
 */
export function randomToken(length = 32) {
  return base64urlEncode(randomBytes(length));
}
