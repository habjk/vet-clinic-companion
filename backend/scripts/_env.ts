import { config } from 'dotenv';
import type { Env } from '../src/env.js';

config({ path: ['.dev.vars', '.env'], quiet: true });
export const env = process.env as unknown as Env & Record<string, string | undefined>;

export function need(...keys: string[]) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Missing in .dev.vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}
