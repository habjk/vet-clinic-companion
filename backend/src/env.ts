/**
 * Configuration. On Cloudflare Workers these arrive as bindings (wrangler secrets / vars);
 * on Node (Cloud Run, local) src/node.ts passes process.env in the same shape.
 */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ENCRYPTION_KEY: string; // base64-encoded 32 bytes
  JOB_SECRET: string;
  ONCALL_CODE: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  DASHBOARD_ORIGIN?: string;
}

const REQUIRED: (keyof Env)[] = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'ENCRYPTION_KEY',
  'JOB_SECRET',
  'ONCALL_CODE',
];

export function missingEnv(env: Partial<Env>): string[] {
  return REQUIRED.filter((k) => !env[k]);
}
