import { decrypt } from '../crypto.js';
import type { Deps } from '../deps.js';
import type { ClinicSettings } from '../settings.js';
import type { Owner } from '../types.js';
import { sendEmail } from './email.js';
import { sendTelegram } from './telegram.js';

/** Sends a message on the owner's preferred channel and records it in the conversation log. */
export async function sendToOwner(
  deps: Deps,
  s: ClinicSettings,
  owner: Owner,
  text: string,
  meta: { petId?: string | null; scheduledMessageId?: string; subject?: string },
): Promise<'telegram' | 'email'> {
  let channel: 'telegram' | 'email';
  const { env } = deps;

  if (owner.preferred_channel === 'email' && owner.email_enc && env.RESEND_API_KEY && env.EMAIL_FROM) {
    const to = await decrypt(owner.email_enc, env.ENCRYPTION_KEY);
    await sendEmail(env.RESEND_API_KEY, env.EMAIL_FROM, to!, meta.subject ?? `A message from ${s.clinic_name}`, text);
    channel = 'email';
  } else if (owner.telegram_chat_id) {
    await sendTelegram(env.TELEGRAM_BOT_TOKEN, owner.telegram_chat_id, text);
    channel = 'telegram';
  } else {
    throw new Error('Owner has no reachable channel (not linked to Telegram and no email set up)');
  }

  const { error } = await deps.db.from('messages').insert({
    owner_id: owner.id,
    pet_id: meta.petId ?? null,
    direction: 'outbound',
    channel,
    body: text,
    scheduled_message_id: meta.scheduledMessageId ?? null,
  });
  if (error) console.error('Failed to log outbound message:', error.message);
  return channel;
}
