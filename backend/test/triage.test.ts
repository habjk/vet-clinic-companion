import { describe, expect, it } from 'vitest';
import { safetyNet } from '../src/ai/safetyNet.js';
import { combineTriage } from '../src/ai/triage.js';

describe('combining the safety net with the AI', () => {
  it('the safety net overrides an AI "ok"', () => {
    const r = combineTriage(safetyNet('there is blood everywhere'), { urgency: 'ok', summary: 'fine' }, '');
    expect(r).toMatchObject({ urgency: 'urgent', source: 'keyword' });
  });

  it('marks agreement as "both"', () => {
    const r = combineTriage(safetyNet('she had a seizure'), { urgency: 'urgent', summary: 'seizure' }, '');
    expect(r.source).toBe('both');
  });

  it('trusts the AI when no red flags matched', () => {
    const r = combineTriage(safetyNet('a bit of redness'), { urgency: 'callback', summary: 'redness' }, '');
    expect(r).toMatchObject({ urgency: 'callback', source: 'ai' });
  });

  it('sends every reply to staff when the AI is unavailable', () => {
    expect(combineTriage(safetyNet('doing great!'), null, 'doing great!').urgency).toBe('callback');
    expect(combineTriage(safetyNet('he collapsed'), null, 'he collapsed').urgency).toBe('urgent');
  });
});
