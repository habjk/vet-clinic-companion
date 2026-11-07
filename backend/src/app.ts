import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { decrypt, encrypt } from './crypto.js';
import { check, makeDeps } from './deps.js';
import { missingEnv, type Env } from './env.js';
import { handleTelegramUpdate, type TelegramUpdate } from './services/inbound.js';
import { runTick } from './services/scheduler.js';
import { errorMessage } from './util.js';

type AppEnv = { Bindings: Env; Variables: { staffUserId: string } };

export const app = new Hono<AppEnv>();

app.use('/api/*', async (c, next) =>
  cors({
    origin: c.env.DASHBOARD_ORIGIN ? c.env.DASHBOARD_ORIGIN.split(',') : '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })(c, next),
);

app.get('/healthz', (c) => {
  const missing = missingEnv(c.env);
  return c.json({ ok: missing.length === 0, missing }, missing.length ? 500 : 200);
});

/**
 * On Workers, finish the work after replying (waitUntil). On Node/Cloud Run there is no
 * waitUntil, so we finish before replying: Cloud Run may pause the CPU once a response is
 * sent, and Telegram happily waits a few seconds for the 200.
 */
async function finishWork(c: Context<AppEnv>, work: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    await work;
  }
}

// ───── Telegram webhook (owners and on-call staff talk to the bot) ─────
app.post('/telegram/webhook', async (c) => {
  if (c.req.header('x-telegram-bot-api-secret-token') !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const update = (await c.req.json()) as TelegramUpdate;
  const work = handleTelegramUpdate(makeDeps(c.env), update).catch((err) =>
    console.error(JSON.stringify({ event: 'telegram_update_failed', update_id: update.update_id, error: errorMessage(err) })),
  );
  await finishWork(c, work);
  return c.json({ ok: true });
});

// ───── Scheduler trigger (Cloud Scheduler, or manual) ─────
app.post('/jobs/tick', async (c) => {
  if (c.req.header('x-job-secret') !== c.env.JOB_SECRET) return c.json({ error: 'unauthorized' }, 401);
  try {
    return c.json({ ok: true, result: await runTick(makeDeps(c.env)) });
  } catch (err) {
    return c.json({ ok: false, error: errorMessage(err) }, 500);
  }
});

// ───── Staff API (dashboard). Supabase session token required. ─────
async function requireStaff(c: Context<AppEnv>, next: Next) {
  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Sign in required' }, 401);
  const { db } = makeDeps(c.env);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return c.json({ error: 'Session expired; sign in again' }, 401);
  const staff = await db.from('staff').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!staff.data) return c.json({ error: 'This account is not a staff member' }, 403);
  c.set('staffUserId', data.user.id);
  await next();
}

app.use('/api/*', requireStaff);

/** Decrypts an owner's phone and email for a callback. Every view is logged. */
app.get('/api/owners/:id/contact', async (c) => {
  const deps = makeDeps(c.env);
  const id = c.req.param('id');
  const owner = (await deps.db.from('owners').select('phone_enc, email_enc').eq('id', id).maybeSingle()).data as
    | { phone_enc: string | null; email_enc: string | null }
    | null;
  if (!owner) return c.json({ error: 'Owner not found' }, 404);
  check(
    await deps.db.from('contact_access_log').insert({ owner_id: id, staff_user_id: c.get('staffUserId') }),
    'log contact access',
  );
  return c.json({
    phone: await decrypt(owner.phone_enc, c.env.ENCRYPTION_KEY),
    email: await decrypt(owner.email_enc, c.env.ENCRYPTION_KEY),
  });
});

const NewOwner = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.email().optional().or(z.literal('')),
  preferredChannel: z.enum(['telegram', 'email']).default('telegram'),
  pet: z.object({
    name: z.string().trim().min(1).max(60),
    species: z.string().trim().min(1).max(40),
    breed: z.string().trim().max(60).optional().or(z.literal('')),
  }),
});

/** Registers an owner and their first pet. Contact details are encrypted before storage. */
app.post('/api/owners', async (c) => {
  const parsed = NewOwner.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Check the form', issues: parsed.error.issues }, 400);
  const input = parsed.data;
  const deps = makeDeps(c.env);
  try {
    const owner = check(
      await deps.db
        .from('owners')
        .insert({
          full_name: input.fullName,
          phone_enc: await encrypt(input.phone, c.env.ENCRYPTION_KEY),
          email_enc: await encrypt(input.email, c.env.ENCRYPTION_KEY),
          preferred_channel: input.preferredChannel,
        })
        .select('id, telegram_link_token')
        .single(),
      'create owner',
    ) as { id: string; telegram_link_token: string };
    const pet = check(
      await deps.db
        .from('pets')
        .insert({ owner_id: owner.id, name: input.pet.name, species: input.pet.species, breed: input.pet.breed || null })
        .select('id')
        .single(),
      'create pet',
    ) as { id: string };
    return c.json({ ownerId: owner.id, petId: pet.id, linkToken: owner.telegram_link_token }, 201);
  } catch (err) {
    return c.json({ error: errorMessage(err) }, 500);
  }
});

/** "Send due messages now" button: handy for demos and for staff after fixing a problem. */
app.post('/api/run-now', async (c) => {
  try {
    return c.json({ ok: true, result: await runTick(makeDeps(c.env)) });
  } catch (err) {
    return c.json({ ok: false, error: errorMessage(err) }, 500);
  }
});
