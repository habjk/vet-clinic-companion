import type { ClinicSettings } from './settings.js';
import type { EmergencyContact } from './services/emergency.js';

/**
 * Fixed wording for anything clinical or safety-related. The AI never writes these:
 * what an owner is told in an emergency must be exactly right every time.
 */
export const templates = {
  welcome: (ownerName: string, petNames: string[], s: ClinicSettings) =>
    `Hi ${ownerName.split(' ')[0]}! You're now connected to ${s.clinic_name}. ` +
    `We'll send reminders and check-ins for ${listNames(petNames)} here, and you can reply any time.\n\n` +
    `This chat isn't monitored around the clock. For an emergency, call ${s.clinic_phone}` +
    `${s.er_name ? ` or, after hours, ${s.er_name}${s.er_phone ? ` at ${s.er_phone}` : ''}` : ''}.\n` +
    `Reply STOP at any time to stop messages.`,

  notLinked: (s?: ClinicSettings) =>
    `Hi! To connect, please scan the QR code from ${s?.clinic_name ?? 'your vet clinic'}, or ask the front desk for your link.`,

  stopped: (s: ClinicSettings) =>
    `You won't get any more messages from ${s.clinic_name}. To start again, send /start.`,

  resubscribed: (s: ClinicSettings) => `Welcome back! Messages from ${s.clinic_name} are switched on again.`,

  optedOutReminder: () => `Messages are switched off for this chat. Send /start to switch them back on.`,

  postopDay1: (pet: string, procedure: string) =>
    `Hi, it's the team checking in on ${pet} after yesterday's ${procedure.toLowerCase()}. ` +
    `How are they doing today? Are they eating and drinking, and does the incision look clean and dry? ` +
    `Reply here, and send a photo of the incision if you can.`,

  postopDay3: (pet: string, procedure: string) =>
    `Hi again! It's been a few days since ${pet}'s ${procedure.toLowerCase()}. ` +
    `How is the recovery going? Any redness, swelling, discharge, or licking at the incision? ` +
    `A quick reply or photo helps us make sure everything is healing well.`,

  vaccineFallback: (pet: string, vaccine: string, dueOn: string, s: ClinicSettings, followup: boolean) =>
    `${followup ? 'A friendly follow-up: ' : 'Hi! '}${pet}'s ${vaccine} vaccine is due on ${formatDate(dueOn)}. ` +
    (s.booking_url ? `Book a visit here: ${s.booking_url} ` : `Call us at ${s.clinic_phone} to book. `) +
    `Reply if you have any questions.`,

  urgent: (s: ClinicSettings, open: boolean, er: EmergencyContact | null) =>
    open
      ? `This may need urgent attention. Please call us right now at ${s.clinic_phone}. ` +
        `If you can't reach us, go to ${er ? describeEr(er) : 'your nearest emergency vet'}. ` +
        `A team member has also been alerted.`
      : `This may need urgent attention, and the clinic is closed now. ` +
        `Please call or go to ${er ? describeEr(er) : 'your nearest 24-hour emergency vet'} straight away. ` +
        `Our on-call team has been alerted.`,

  callback: (s: ClinicSettings, open: boolean) =>
    open
      ? `Thanks for letting us know. A team member will call you back today. ` +
        `If things get worse before then, call us at ${s.clinic_phone}.`
      : `Thanks for letting us know. We're closed right now, and a team member will call you after we open. ` +
        `If things get worse, call an emergency vet straight away.`,

  ok: (pet: string | null) =>
    `Thank you, that's great to hear${pet ? ` about ${pet}` : ''}! Reply here any time if anything changes.`,

  oncallSet: (s: ClinicSettings) =>
    `This chat will now receive urgent alerts for ${s.clinic_name}.`,

  oncallAlert: (owner: string, pet: string | null, summary: string, text: string, dashboard?: string) =>
    `URGENT reply from ${owner}${pet ? ` about ${pet}` : ''}\n\n` +
    `${summary}\n\nOwner wrote: "${text || '(photo only)'}"` +
    (dashboard ? `\n\nOpen the dashboard: ${dashboard}` : ''),
};

function describeEr(er: EmergencyContact): string {
  return `${er.name}${er.phone ? ` (${er.phone})` : ''}${er.address ? `, ${er.address}` : ''}`;
}

function listNames(names: string[]): string {
  if (names.length === 0) return 'your pets';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
