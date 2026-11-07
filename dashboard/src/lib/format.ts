const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function timeAgo(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return seconds <= 0 ? 'just now' : 'in under a minute';
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const dateOnly = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const kindLabel: Record<string, string> = {
  vaccine_reminder: 'Vaccine reminder',
  vaccine_followup: 'Vaccine follow-up',
  postop_day1: 'Post-op check-in, day 1',
  postop_day3: 'Post-op check-in, day 3',
};

export function telegramLink(token: string): string {
  const bot = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? 'your_bot';
  return `https://t.me/${bot}?start=${token}`;
}
