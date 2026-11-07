/**
 * AES-256-GCM encryption for owner contact details, using Web Crypto so the same
 * code runs on Cloudflare Workers and Node. Format: "v1:<iv>:<ciphertext>" (base64).
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromB64(keyB64);
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(plain: string | null | undefined, keyB64: string): Promise<string | null> {
  if (!plain) return null;
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plain)));
  return `v1:${toB64(iv)}:${toB64(cipher)}`;
}

export async function decrypt(token: string | null | undefined, keyB64: string): Promise<string | null> {
  if (!token) return null;
  const [version, ivB64, cipherB64] = token.split(':');
  if (version !== 'v1' || !ivB64 || !cipherB64) throw new Error('Unrecognised ciphertext format');
  const key = await importKey(keyB64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(cipherB64));
  return decoder.decode(plain);
}
