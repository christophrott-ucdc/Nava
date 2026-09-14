import { createHmac, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(): string { let bits = 0, value = 0, result = ''; for (const byte of randomBytes(20)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
    }
} return result; }
function decode(secret: string): Buffer { let bits = 0, value = 0; const result: number[] = []; for (const char of secret) {
    const n = alphabet.indexOf(char);
    if (n < 0)
        throw Error('Invalid TOTP secret');
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
        result.push((value >>> (bits - 8)) & 255);
        bits -= 8;
    }
} return Buffer.from(result); }
/** RFC 6238: HMAC-SHA1, six digits, 30-second steps. */
export function totp(secret: string, counter: number, digits = 6): string { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter)); const mac = createHmac('sha1', decode(secret)).update(b).digest(), offset = mac[mac.length - 1] & 15; return String((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0'); }
export function matchTotp(secret: string, code: string, lastCounter = -1, now = Date.now()): number | null { if (!/^\d{6}$/.test(code))
    return null; const step = Math.floor(now / 30000); for (const counter of [step, step - 1, step + 1])
    if (counter >= 0 && counter > lastCounter && timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code)))
        return counter; return null; }
export function sealSecret(secret: string, key: Buffer): string { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(secret, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64'); }
export function openSecret(sealed: string, key: Buffer): string { const data = Buffer.from(sealed, 'base64'); if (data.length < 29)
    throw Error('Invalid encrypted credential'); const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12)); decipher.setAuthTag(data.subarray(-16)); return Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString('utf8'); }
