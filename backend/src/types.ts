export interface Owner {
  id: string;
  full_name: string;
  phone_enc: string | null;
  email_enc: string | null;
  preferred_channel: 'telegram' | 'email';
  telegram_chat_id: string | null;
  telegram_link_token: string;
  opted_in: boolean;
  opted_out_at: string | null;
}

export interface Pet {
  id: string;
  owner_id: string;
  name: string;
  species: string;
  breed: string | null;
}

export type MessageKind = 'vaccine_reminder' | 'vaccine_followup' | 'postop_day1' | 'postop_day3';

export interface ScheduledMessage {
  id: string;
  owner_id: string;
  pet_id: string | null;
  kind: MessageKind;
  related_id: string | null;
  send_at: string;
  status: string;
  dedupe_key: string;
}

export type Urgency = 'ok' | 'callback' | 'urgent';
