import type { Deps } from '../deps.js';
import { sleep } from '../util.js';

/**
 * The only file that knows which AI provider we use. Swapping to Claude, Groq or
 * another model means rewriting generateJson() and nothing else.
 */
export interface LlmImage {
  mimeType: string;
  base64: string;
}

export interface JsonRequest {
  kind: string; // label for the audit log, e.g. "triage"
  system: string;
  text: string;
  image?: LlmImage;
  schema: Record<string, unknown>; // Gemini response schema (OpenAPI subset)
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function generateJson(deps: Deps, req: JsonRequest): Promise<unknown> {
  const model = deps.env.GEMINI_MODEL || DEFAULT_MODEL;
  const started = Date.now();
  const parts: Record<string, unknown>[] = [{ text: req.text }];
  if (req.image) parts.push({ inlineData: { mimeType: req.image.mimeType, data: req.image.base64 } });

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: req.schema, },
  });

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1)); // 1s, 2s backoff for free-tier rate limits
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.env.GEMINI_API_KEY },
          body,
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) {
        lastError = `Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`;
        if (RETRYABLE.has(res.status)) continue;
        break;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      const parsed: unknown = JSON.parse(text);
      await logEvent(deps, { kind: req.kind, model, input: req.text, output: parsed, latency: Date.now() - started });
      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  await logEvent(deps, { kind: req.kind, model, input: req.text, error: lastError, latency: Date.now() - started });
  throw new Error(lastError || 'Gemini request failed');
}

/** Every AI call is recorded so staff can see why a reply was or wasn't escalated. */
async function logEvent(
  deps: Deps,
  e: { kind: string; model: string; input: string; output?: unknown; error?: string; latency: number },
) {
  const { error } = await deps.db.from('ai_events').insert({
    kind: e.kind,
    model: e.model,
    input: e.input.slice(0, 4000),
    output: e.output ?? null,
    error: e.error ?? null,
    latency_ms: e.latency,
  });
  if (error) console.error('Failed to write ai_events:', error.message);
}
