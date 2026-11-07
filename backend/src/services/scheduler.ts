import { writeVaccineReminder } from '../ai/writer.js';
import { check, type Deps } from '../deps.js';
import { getSettings, isQuietHours, type ClinicSettings } from '../settings.js';
import { templates } from '../templates.js';
import type { Owner, Pet, ScheduledMessage } from '../types.js';
import { errorMessage } from '../util.js';
import { sendToOwner } from './outbound.js';

const REMIND_DAYS_BEFORE = 14;
const FOLLOWUP_AFTER_DAYS = 7;
const BATCH = 25;

/** Runs every 15 minutes (Cloudflare Cron Trigger or Cloud Scheduler). */
export async function runTick(deps: Deps) {
  const s = await getSettings(deps);
  const recovered = await recoverStuckSends(deps);
  const queued = await queueVaccineReminders(deps);
  const result = await sendDueMessages(deps, s);
  return { recovered, queued, ...result };
}

/** Finds vaccines coming due and plans one reminder each. The dedupe key prevents repeats. */
async function queueVaccineReminders({ db }: Deps): Promise<number> {
  const horizon = new Date(Date.now() + REMIND_DAYS_BEFORE * 86_400_000).toISOString().slice(0, 10);
  const due = check(
    await db.from('vaccinations').select('id, due_on, pet_id, pets(owner_id)').eq('completed', false).lte('due_on', horizon),
    'find due vaccines',
  ) as unknown as { id: string; due_on: string; pet_id: string; pets: { owner_id: string } | null }[];

  const rows = due
    .filter((v) => v.pets)
    .map((v) => ({
      owner_id: v.pets!.owner_id,
      pet_id: v.pet_id,
      kind: 'vaccine_reminder',
      related_id: v.id,
      send_at: new Date().toISOString(),
      dedupe_key: `vaccine:${v.id}:${v.due_on}`,
    }));
  if (rows.length) {
    check(await db.from('scheduled_messages').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true }), 'queue reminders');
  }
  return rows.length;
}

/** Sends everything that is due, unless it's quiet hours. */
async function sendDueMessages(deps: Deps, s: ClinicSettings) {
  if (isQuietHours(new Date(), s)) return { sent: 0, skipped: 0, failed: 0, deferred: 'quiet hours' };

  const due = check(
    await deps.db
      .from('scheduled_messages')
      .select('*, owners(*), pets(*)')
      .eq('status', 'pending')
      .lte('send_at', new Date().toISOString())
      .order('send_at')
      .limit(BATCH),
    'load due messages',
  ) as (ScheduledMessage & { owners: Owner; pets: Pet | null })[];

  let sent = 0, skipped = 0, failed = 0;
  for (const m of due) {
    // Claim the row atomically so two overlapping runs can never both send it.
    const claimed = await deps.db
      .from('scheduled_messages')
      .update({ status: 'sending', claimed_at: new Date().toISOString() })
      .eq('id', m.id)
      .eq('status', 'pending')
      .select('id');
    if (!claimed.data?.length) continue;

    try {
      const outcome = await sendOne(deps, s, m);
      if (outcome.skip) {
        await finish(deps, m.id, { status: 'skipped', error: outcome.skip });
        skipped++;
      } else {
        await finish(deps, m.id, { status: 'sent', body: outcome.body, sent_at: new Date().toISOString() });
        sent++;
      }
    } catch (err) {
      await finish(deps, m.id, { status: 'failed', error: errorMessage(err).slice(0, 500) });
      failed++;
    }
  }
  return { sent, skipped, failed };
}

async function sendOne(
  deps: Deps,
  s: ClinicSettings,
  m: ScheduledMessage & { owners: Owner; pets: Pet | null },
): Promise<{ skip?: string; body?: string }> {
  const owner = m.owners;
  const pet = m.pets;
  if (!owner.opted_in || owner.opted_out_at) return { skip: 'Owner has not opted in' };
  if (!pet) return { skip: 'Pet record no longer exists' };

  let body: string;
  if (m.kind === 'vaccine_reminder' || m.kind === 'vaccine_followup') {
    const vax = (await deps.db.from('vaccinations').select('*').eq('id', m.related_id!).maybeSingle()).data as
      | { vaccine: string; due_on: string; completed: boolean }
      | null;
    if (!vax || vax.completed) return { skip: 'Vaccine already given' };
    body = await writeVaccineReminder(deps, s, {
      petName: pet.name,
      species: pet.species,
      vaccine: vax.vaccine,
      dueOn: vax.due_on,
      followup: m.kind === 'vaccine_followup',
    });
  } else {
    const proc = (await deps.db.from('procedures').select('kind').eq('id', m.related_id!).maybeSingle()).data as
      | { kind: string }
      | null;
    if (!proc) return { skip: 'Procedure record no longer exists' };
    body = m.kind === 'postop_day1' ? templates.postopDay1(pet.name, proc.kind) : templates.postopDay3(pet.name, proc.kind);
  }

  await sendToOwner(deps, s, owner, body, {
    petId: pet.id,
    scheduledMessageId: m.id,
    subject: `${pet.name}: a message from ${s.clinic_name}`,
  });

  if (m.kind === 'vaccine_reminder') {
    // Plan one follow-up; it skips itself if the vaccine is recorded as given by then.
    await deps.db.from('scheduled_messages').upsert(
      {
        owner_id: m.owner_id,
        pet_id: m.pet_id,
        kind: 'vaccine_followup',
        related_id: m.related_id,
        send_at: new Date(Date.now() + FOLLOWUP_AFTER_DAYS * 86_400_000).toISOString(),
        dedupe_key: `${m.dedupe_key}:followup`,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    );
  }
  return { body };
}

async function finish(deps: Deps, id: string, patch: Record<string, unknown>) {
  const { error } = await deps.db.from('scheduled_messages').update(patch).eq('id', id);
  if (error) console.error(`Failed to update scheduled message ${id}:`, error.message);
}

/**
 * A row left in "sending" means a run crashed mid-send. We can't know whether the owner got
 * the message, so we mark it failed for staff to review instead of risking a duplicate.
 */
async function recoverStuckSends({ db }: Deps): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await db
    .from('scheduled_messages')
    .update({ status: 'failed', error: 'Interrupted while sending; check whether the owner received it' })
    .eq('status', 'sending')
    .lt('claimed_at', cutoff)
    .select('id');
  return data?.length ?? 0;
}
