/**
 * Layer 1 of triage: fixed red-flag phrases that ALWAYS escalate, whatever the AI says
 * and even if the AI is unavailable. Deliberately errs on the side of escalating.
 */
const RED_FLAGS: { label: string; pattern: RegExp }[] = [
  { label: 'bleeding', pattern: /\b(bleed(ing|s)?|blood(y)?)\b/i },
  { label: 'breathing difficulty', pattern: /\b(not breathing|can'?t breathe|cannot breathe|trouble breathing|struggling to breathe|gasping|choking)\b/i },
  { label: 'seizure', pattern: /\b(seiz(ure|ures|ing)|convuls(ing|ion|ions)|fitting)\b/i },
  { label: 'collapse', pattern: /\b(collaps(e|ed|ing)|unresponsive|won'?t wake|can'?t wake|passed out|unconscious)\b/i },
  { label: 'gum colour', pattern: /\b((pale|white|blue|grey|gray) gums|gums (look|are|seem|turned|went) (very )?(pale|white|blue|grey|gray))\b/i },
  { label: 'incision open', pattern: /\b(stitch(es)? (came|come|are|is) (out|open|undone)|incision (is )?(open|opened|split|gaping)|wound (is )?(open|opened|gaping)|insides? (are |is )?(showing|out)|something (is )?(hanging|sticking) out)\b/i },
  { label: 'bloat', pattern: /\b(bloat(ed|ing)?|swollen (belly|stomach|abdomen)|retching)\b/i },
  { label: 'toxin', pattern: /\b(poison(ed|ing)?|ate (chocolate|grapes|raisins|xylitol|rat bait|antifreeze|ibuprofen|paracetamol|tylenol)|antifreeze)\b/i },
  { label: 'trauma', pattern: /\b(hit by a car|hit by car|fell from|attacked by)\b/i },
  { label: 'severe pain', pattern: /\b(screaming|crying in pain|howling in pain|can'?t stand|cannot stand|can'?t walk|cannot walk|paraly[sz]ed)\b/i },
  { label: 'vomiting repeatedly', pattern: /\b(vomit(ing|ed)? (blood|again and again|non-?stop|repeatedly|all night)|keeps (vomiting|throwing up))\b/i },
  { label: 'urinary blockage', pattern: /\b(can'?t (pee|urinate)|not (peeing|urinating)|straining to (pee|urinate))\b/i },
];

// Words just before a match that reverse its meaning: "no bleeding", "isn't bloody", "not bleeding".
const NEGATION = /\b(no|not|without|isn'?t|hasn'?t|wasn'?t|haven'?t|never)\s+(\w+\s+){0,2}$/i;
// ...unless the phrase says the problem is continuing: "hasn't stopped bleeding", "won't stop bleeding".
const CONTINUING = /\b(stop|stopped|stopping|quit|keeps?|still|started)\s+$/i;

export interface SafetyNetResult {
  urgent: boolean;
  matches: string[];
}

export function safetyNet(input: string): SafetyNetResult {
  const text = input.replace(/[\u2018\u2019]/g, "'"); // phones often send curly apostrophes
  const matches: string[] = [];
  for (const { label, pattern } of RED_FLAGS) {
    const re = new RegExp(pattern.source, 'gi');
    for (const m of text.matchAll(re)) {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 25), m.index ?? 0);
      const startsNegated = /^(not|can'?t|cannot|won'?t)\b/i.test(m[0]); // e.g. "not breathing" is itself the red flag
      if (!startsNegated && NEGATION.test(before) && !CONTINUING.test(before)) continue;
      matches.push(label);
      break;
    }
  }
  return { urgent: matches.length > 0, matches };
}
