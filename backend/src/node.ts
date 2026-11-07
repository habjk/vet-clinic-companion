/** Node entry for Google Cloud Run or local development. Cloud Scheduler calls POST /jobs/tick. */
import { config } from 'dotenv';
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { missingEnv, type Env } from './env.js';

config({ path: ['.dev.vars', '.env'], quiet: true });

const env = process.env as unknown as Env;
const missing = missingEnv(env);
if (missing.length) console.warn(`Missing environment variables: ${missing.join(', ')}`);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: (req) => app.fetch(req, env), port }, () => console.log(`Clinic Companion listening on :${port}`));
