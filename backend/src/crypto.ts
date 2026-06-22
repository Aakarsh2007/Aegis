import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16;

function getKey(): Buffer {
    const keyHex = process.env.FIELD_ENCRYPTION_KEY;
    if (!keyHex) {
        throw new Error('FIELD_ENCRYPTION_KEY environment variable is not set');
    }
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
        throw new Error('FIELD_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a string in the format: iv_hex:tag_hex:ciphertext_hex
 */
export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a string produced by encrypt().
 * Expects format: iv_hex:tag_hex:ciphertext_hex
 */
export function decrypt(ciphertext: string): string {
    const key = getKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid ciphertext format');
    }

    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    if (iv.length !== IV_LENGTH) {
        throw new Error('Invalid IV length');
    }
    if (tag.length !== TAG_LENGTH) {
        throw new Error('Invalid auth tag length');
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

/**
 * Encrypts a value if non-null/non-empty, otherwise returns null.
 */
export function encryptOptional(value: string | null | undefined): string | null {
    if (!value) return null;
    return encrypt(value);
}

/**
 * Decrypts a value if non-null/non-empty, otherwise returns null.
 */
export function decryptOptional(value: string | null | undefined): string | null {
    if (!value) return null;
    return decrypt(value);
}
