import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../src/crypto.js';

const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

describe('contact encryption', () => {
  it('round-trips and uses a fresh IV each time', async () => {
    const a = await encrypt('+1 555 010 1234', key);
    const b = await encrypt('+1 555 010 1234', key);
    expect(a).not.toBe(b);
    expect(await decrypt(a, key)).toBe('+1 555 010 1234');
  });

  it('rejects tampered ciphertext', async () => {
    const token = (await encrypt('secret', key))!;
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await expect(decrypt(tampered, key)).rejects.toThrow();
  });

  it('passes empty values through as null', async () => {
    expect(await encrypt('', key)).toBeNull();
    expect(await decrypt(null, key)).toBeNull();
  });
});
