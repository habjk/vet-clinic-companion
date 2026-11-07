import { check, type Deps } from './deps.js';

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
  clinic_lat: number | null;
  clinic_lon: number | null;
  on_duty_telegram_chat_id: string | null;
}

export async function getSettings({ db }: Deps): Promise<ClinicSettings> {
  return check(await db.from('clinic_settings').select('*').eq('id', 1).single(), 'load clinic settings') as ClinicSettings;
}

/** Hour of day (0–23) in the given IANA time zone. */
export function localHour(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date);
  return Number(hour) % 24;
}

/** True if hour is within [start, end), handling windows that wrap past midnight. */
export function inWindow(hour: number, start: number, end: number): boolean {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

export const isQuietHours = (now: Date, s: ClinicSettings) =>
  inWindow(localHour(now, s.timezone), s.quiet_start, s.quiet_end);

export const isClinicOpen = (now: Date, s: ClinicSettings) =>
  inWindow(localHour(now, s.timezone), s.open_hour, s.close_hour);
