/** Cloudflare Workers entry: HTTP via Hono, plus the Cron Trigger every 15 minutes. */
import { app } from './app.js';
import { makeDeps } from './deps.js';
import type { Env } from './env.js';
import { runTick } from './services/scheduler.js';

interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: unknown, env: Env, ctx: WaitUntil) {
    ctx.waitUntil(
      runTick(makeDeps(env))
        .then((r) => console.log(JSON.stringify({ event: 'tick', ...r })))
        .catch((err) => console.error(JSON.stringify({ event: 'tick_failed', error: String(err) }))),
    );
  },
};
