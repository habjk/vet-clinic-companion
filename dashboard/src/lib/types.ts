export type Urgency = 'urgent' | 'callback';

export interface Alert {
  id: string;
  urgency: Urgency;
  source: 'keyword' | 'ai' | 'both' | 'fallback';
  summary: string | null;
  matched_terms: string[];
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  owner_id: string;
  pet_id: string | null;
  owners: { full_name: string } | null;
  pets: { name: string; species: string } | null;
  messages: { body: string | null; photo_path: string | null } | null;
}

export interface Owner {
  id: string;
  full_name: string;
  telegram_chat_id: string | null;
  telegram_link_token: string;
  opted_in: boolean;
  opted_out_at: string | null;
  preferred_channel: 'telegram' | 'email';
}

export interface Vaccination {
  id: string;
  vaccine: string;
  due_on: string;
  given_on: string | null;
  completed: boolean;
}

export interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  owner_id: string;
  owners: Owner;
  vaccinations: Vaccination[];
}

export interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  photo_path: string | null;
  created_at: string;
}

export interface ScheduledMessage {
  id: string;
  kind: 'vaccine_reminder' | 'vaccine_followup' | 'postop_day1' | 'postop_day3';
  send_at: string;
  status: 'pending' | 'sending' | 'sent' | 'skipped' | 'cancelled' | 'failed';
  error: string | null;
  sent_at: string | null;
  pet_id: string | null;
  pets: { name: string } | null;
  owners: { full_name: string } | null;
}

export interface ClinicSettings {
  clinic_name: string;
  clinic_phone: string;
  timezone: string;
  open_hour: number;
  close_hour: number;
  quiet_start: number;
  quiet_end: number;
  booking_url: string | null;
  er_name: string | null;
  er_phone: string | null;
  er_address: string | null;
  on_duty_telegram_chat_id: string | null;
}
