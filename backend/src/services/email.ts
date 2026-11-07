import { log } from "node:console";

/** Resend free tier: 3,000 emails/month. Optional; Telegram is the main channel. */
export async function sendEmail(apiKey: string, from: string, to: string, subject: string, text: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  });
  log(`Sent email to ${to} with subject "${subject}" (status ${res.status})`);
  log("Response body:", await res.text());
  if (!res.ok) throw new Error(`Resend failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}
