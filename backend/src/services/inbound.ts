import { triageReply } from '../ai/triage.js';
import { check, type Deps } from '../deps.js';
import { getSettings, isClinicOpen, type ClinicSettings } from '../settings.js';
import { templates } from '../templates.js';
import type { Owner, Pet } from '../types.js';
import { errorMessage } from '../util.js';
import { findEmergencyVet } from './emergency.js';
import { sendToOwner } from './outbound.js';
import { bytesToBase64, downloadTelegramPhoto, sendTelegram } from './telegram.js';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    caption?: string;
    photo?: { file_id: string; file_size?: number }[];
  };
}

/** Handles one Telegram update: opt-in, opt-out, on-call registration, or an owner's reply. */
export async function handleTelegramUpdate(deps: Deps, update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);
  const text = (msg.text ?? msg.caption ?? '').trim();
  const s = await getSettings(deps);
  const reply = (t: string) => sendTelegram(deps.env.TELEGRAM_BOT_TOKEN, chatId, t);

  // ── Commands ──
  const startMatch = /^\/start(?:\s+(\S+))?$/i.exec(text);
  if (startMatch) return handleStart(deps, s, chatId, startMatch[1], reply);
  if (/^\/?stop$/i.test(text)) return handleStop(deps, s, chatId, reply);
  const oncall = /^\/oncall\s+(\S+)$/i.exec(text);
  if (oncall) {
    if (oncall[1] !== deps.env.ONCALL_CODE) return reply('That code is not valid.');
    check(await deps.db.from('clinic_settings').update({ on_duty_telegram_chat_id: chatId }).eq('id', 1), 'set on-call');
    return reply(templates.oncallSet(s));
  }

  // ── Owner reply ──
  const owner = (await deps.db.from('owners').select('*').eq('telegram_chat_id', chatId).maybeSingle()).data as Owner | null;
  if (!owner) return reply(templates.notLinked(s));
  if (owner.opted_out_at || !owner.opted_in) return reply(templates.optedOutReminder());

  const context = await findPetContext(deps, owner);

  // Store the photo (private bucket) and keep a copy for the AI to look at.
  let photoPath: string | null = null;
  let image: { mimeType: string; base64: string } | undefined;
  if (msg.photo?.length) {
    try {
      const photo = await downloadTelegramPhoto(deps.env.TELEGRAM_BOT_TOKEN, msg.photo);
      if (photo) {
        photoPath = `${owner.id}/${update.update_id}.jpg`;
        check(
          await deps.db.storage.from('photos').upload(photoPath, photo.bytes, { contentType: photo.mimeType, upsert: true }),
          'upload photo',
        );
        image = { mimeType: photo.mimeType, base64: bytesToBase64(photo.bytes) };
      }
    } catch (err) {
      console.error('Photo handling failed:', errorMessage(err));
    }
  }

  // The unique telegram_update_id makes Telegram's retries harmless.
  const inserted = await deps.db
    .from('messages')
    .insert({
      owner_id: owner.id,
      pet_id: context.pet?.id ?? null,
      direction: 'inbound',
      channel: 'telegram',
      body: text || null,
      photo_path: photoPath,
      telegram_update_id: update.update_id,
    })
    .select('id')
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505') return; // already processed this update
    throw new Error(`log inbound message: ${inserted.error.message}`);
  }

  const triage = await triageReply(deps, {
    text,
    image,
    petName: context.pet?.name,
    species: context.pet?.species,
    lastMessage: context.lastOutbound,
  });

  const open = isClinicOpen(new Date(), s);
  if (triage.urgency !== 'ok') {
    check(
      await deps.db.from('alerts').insert({
        owner_id: owner.id,
        pet_id: context.pet?.id ?? null,
        message_id: inserted.data.id,
        urgency: triage.urgency,
        source: triage.source,
        summary: triage.summary,
        matched_terms: triage.matchedTerms,
      }),
      'create alert',
    );
  }

  if (triage.urgency === 'urgent') {
    const er = await findEmergencyVet(s);
    await sendToOwner(deps, s, owner, templates.urgent(s, open, er), { petId: context.pet?.id });
    if (s.on_duty_telegram_chat_id) {
      await sendTelegram(
        deps.env.TELEGRAM_BOT_TOKEN,
        s.on_duty_telegram_chat_id,
        templates.oncallAlert(owner.full_name, context.pet?.name ?? null, triage.summary, text, deps.env.DASHBOARD_ORIGIN),
      ).catch((err) => console.error('On-call alert failed:', errorMessage(err)));
    }
  } else if (triage.urgency === 'callback') {
    await sendToOwner(deps, s, owner, templates.callback(s, open), { petId: context.pet?.id });
  } else {
    await sendToOwner(deps, s, owner, templates.ok(context.pet?.name ?? null), { petId: context.pet?.id });
  }
}

async function handleStart(
  deps: Deps,
  s: ClinicSettings,
  chatId: string,
  token: string | undefined,
  reply: (t: string) => Promise<void>,
) {
  if (!token) {
    // "/start" with no token: an existing owner switching messages back on.
    const existing = (await deps.db.from('owners').select('id').eq('telegram_chat_id', chatId).maybeSingle()).data;
    if (!existing) return reply(templates.notLinked(s));
    check(
      await deps.db.from('owners').update({ opted_in: true, opted_out_at: null }).eq('id', existing.id),
      'resubscribe',
    );
    return reply(templates.resubscribed(s));
  }

  const owner = (await deps.db.from('owners').select('*').eq('telegram_link_token', token).maybeSingle()).data as Owner | null;
  if (!owner) return reply(templates.notLinked(s));

  // A chat can belong to only one owner; release it from any previous link first.
  await deps.db.from('owners').update({ telegram_chat_id: null }).eq('telegram_chat_id', chatId).neq('id', owner.id);
  check(
    await deps.db
      .from('owners')
      .update({ telegram_chat_id: chatId, opted_in: true, opted_out_at: null })
      .eq('id', owner.id),
    'link owner',
  );
  const pets = (await deps.db.from('pets').select('name').eq('owner_id', owner.id)).data ?? [];
  return reply(templates.welcome(owner.full_name, pets.map((p: { name: string }) => p.name), s));
}

async function handleStop(deps: Deps, s: ClinicSettings, chatId: string, reply: (t: string) => Promise<void>) {
  const { data } = await deps.db
    .from('owners')
    .update({ opted_in: false, opted_out_at: new Date().toISOString() })
    .eq('telegram_chat_id', chatId)
    .select('id');
  if (data?.length) {
    // Cancel anything still queued for this owner.
    await deps.db
      .from('scheduled_messages')
      .update({ status: 'cancelled', error: 'Owner opted out' })
      .eq('owner_id', data[0].id)
      .eq('status', 'pending');
  }
  return reply(templates.stopped(s));
}

/** Which pet is this reply about? The most recent check-in wins; a one-pet household is easy. */
async function findPetContext(deps: Deps, owner: Owner): Promise<{ pet: Pet | null; lastOutbound: string | null }> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const last = (
    await deps.db
      .from('messages')
      .select('body, pet_id')
      .eq('owner_id', owner.id)
      .eq('direction', 'outbound')
      .gte('created_at', since)
      .not('pet_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ).data as { body: string | null; pet_id: string } | null;

  if (last) {
    const pet = (await deps.db.from('pets').select('*').eq('id', last.pet_id).maybeSingle()).data as Pet | null;
    return { pet, lastOutbound: last.body };
  }
  const pets = ((await deps.db.from('pets').select('*').eq('owner_id', owner.id)).data ?? []) as Pet[];
  return { pet: pets.length === 1 ? pets[0] : null, lastOutbound: null };
}
