/** Points the Telegram bot at the deployed backend. Run: npm run set-webhook -- https://your-backend.example */
import { env, need } from './_env.js';

need('TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET');
const base = process.argv[2] ?? env.PUBLIC_BACKEND_URL;
if (!base) {
  console.error('Usage: npm run set-webhook -- https://your-backend-url');
  process.exit(1);
}

const call = async (method: string, body: unknown) => {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};

console.log(
  await call('setWebhook', {
    url: `${base.replace(/\/$/, '')}/telegram/webhook`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
  }),
);
console.log(await call('setMyCommands', { commands: [{ command: 'stop', description: 'Stop messages from the clinic' }] }));
