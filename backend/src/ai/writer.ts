import { z } from 'zod';
import type { Deps } from '../deps.js';
import type { ClinicSettings } from '../settings.js';
import { formatDate, templates } from '../templates.js';
import { generateJson } from './llm.js';

const SYSTEM = `You write short, warm reminder messages from a veterinary clinic to a pet owner.
Rules: 2 to 3 sentences, under 350 characters, plain text, no emojis, no medical claims, no urgency or guilt.
Mention the pet's name, the vaccine, and the due date exactly as given. Include the booking instruction exactly as given.`;

const Output = z.object({ message: z.string().min(20).max(450) });

/**
 * Vaccine reminders are personalised by the AI, then checked. If the AI is unavailable or
 * its text leaves out a required detail, the fixed template is used instead.
 */
export async function writeVaccineReminder(
  deps: Deps,
  s: ClinicSettings,
  v: { petName: string; species: string; vaccine: string; dueOn: string; followup: boolean },
): Promise<string> {
  const fallback = templates.vaccineFallback(v.petName, v.vaccine, v.dueOn, s, v.followup);
  const booking = s.booking_url ? `Book online: ${s.booking_url}` : `Call ${s.clinic_phone} to book.`;
  try {
    const raw = await generateJson(deps, {
      kind: 'reminder',
      system: SYSTEM,
      text:
        `Clinic: ${s.clinic_name}\nPet: ${v.petName} (${v.species})\nVaccine: ${v.vaccine}\n` +
        `Due date: ${formatDate(v.dueOn)}\nBooking instruction: ${booking}\n` +
        (v.followup ? 'This is a gentle second reminder; the owner has not booked yet.' : 'This is the first reminder.'),
      schema: { type: 'OBJECT', properties: { message: { type: 'STRING' } }, required: ['message'] },
    });
    const parsed = Output.safeParse(raw);
    if (!parsed.success) return fallback;
    const msg = parsed.data.message.trim();
    const mustContain = [v.petName, v.vaccine, s.booking_url ?? s.clinic_phone];
    return mustContain.every((part) => msg.toLowerCase().includes(part.toLowerCase())) ? msg : fallback;
  } catch {
    return fallback;
  }
}
