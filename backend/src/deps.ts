import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env.js';

/** Everything a service needs, created per request so it works on Workers and Node alike. */
export interface Deps {
  env: Env;
  db: SupabaseClient;
}

export function makeDeps(env: Env): Deps {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { env, db };
}

/** Throws a readable error for a failed Supabase call. */
export function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}
