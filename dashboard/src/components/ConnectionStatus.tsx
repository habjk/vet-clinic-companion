import type { Owner } from '../lib/types';

export function connectionLabel(o: Pick<Owner, 'opted_in' | 'opted_out_at' | 'telegram_chat_id' | 'preferred_channel'>) {
  if (o.opted_out_at) return { text: 'Opted out (replied STOP)', tone: 'text-muted' };
  if (o.opted_in && o.telegram_chat_id) return { text: 'Connected on Telegram', tone: 'text-scrub' };
  if (o.preferred_channel === 'email') return { text: 'Email', tone: 'text-ink' };
  return { text: 'Not connected yet', tone: 'text-muted' };
}

export function ConnectionStatus({ owner }: { owner: Owner }) {
  const { text, tone } = connectionLabel(owner);
  return <span className={tone}>{text}</span>;
}
