import { describe, expect, it } from 'vitest';
import { inWindow, isQuietHours, localHour, type ClinicSettings } from '../src/settings.js';

const s = { timezone: 'America/New_York', quiet_start: 21, quiet_end: 8 } as ClinicSettings;

describe('time windows', () => {
  it('handles windows that wrap past midnight', () => {
    expect(inWindow(22, 21, 8)).toBe(true);
    expect(inWindow(3, 21, 8)).toBe(true);
    expect(inWindow(12, 21, 8)).toBe(false);
    expect(inWindow(9, 8, 18)).toBe(true);
    expect(inWindow(18, 8, 18)).toBe(false);
  });

  it('uses the clinic time zone, not the server time zone', () => {
    const utcNoon = new Date('2026-07-01T12:00:00Z'); // 08:00 in New York (EDT)
    expect(localHour(utcNoon, 'America/New_York')).toBe(8);
    expect(isQuietHours(new Date('2026-07-01T02:00:00Z'), s)).toBe(true); // 22:00 NY
    expect(isQuietHours(utcNoon, s)).toBe(false);
  });
});
