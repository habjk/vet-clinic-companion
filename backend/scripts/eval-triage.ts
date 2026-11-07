/**
 * Measures triage accuracy on labeled owner replies, using the real AI.
 * The number that matters most: urgent replies that were NOT escalated (must be 0).
 * Run: npm run eval
 */
import fixtures from '../test/fixtures/replies.json' with { type: 'json' };
import { triageReply } from '../src/ai/triage.js';
import { makeDeps } from '../src/deps.js';
import type { Urgency } from '../src/types.js';
import { sleep } from '../src/util.js';
import { env, need } from './_env.js';

need('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY');
const deps = makeDeps(env);
const levels: Urgency[] = ['urgent', 'callback', 'ok'];
const matrix: Record<string, Record<string, number>> = Object.fromEntries(
  levels.map((l) => [l, Object.fromEntries(levels.map((m) => [m, 0]))]),
);
const missed: string[] = [];

for (const f of fixtures as { text: string; expected: Urgency }[]) {
  const r = await triageReply(deps, { text: f.text, petName: 'Max', species: 'Dog', lastMessage: 'Post-op check-in' });
  matrix[f.expected][r.urgency]++;
  if (f.expected === 'urgent' && r.urgency !== 'urgent') missed.push(f.text);
  process.stdout.write(r.urgency === f.expected ? '.' : 'x');
  await sleep(4500); // stay under the free tier's requests-per-minute limit
}

const total = fixtures.length;
const correct = levels.reduce((n, l) => n + matrix[l][l], 0);
const urgentTotal = levels.reduce((n, l) => n + matrix.urgent[l], 0);
console.log('\n\nRows = expected, columns = predicted');
console.table(matrix);
console.log(`Accuracy: ${correct}/${total}`);
console.log(`Urgent replies escalated: ${matrix.urgent.urgent}/${urgentTotal}`);
console.log(`"ok" replies sent to staff unnecessarily: ${matrix.ok.callback + matrix.ok.urgent}`);
if (missed.length) {
  console.log('\nMISSED URGENT REPLIES:');
  missed.forEach((t) => console.log(`  - ${t}`));
  process.exit(1);
}
