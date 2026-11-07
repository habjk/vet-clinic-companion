import { supabase } from './supabase';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** Calls the backend's staff API with the signed-in user's session token. */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `The server returned an error (${res.status}).`);
  return body as T;
}

export const api = {
  contact: (ownerId: string) => call<{ phone: string | null; email: string | null }>(`/api/owners/${ownerId}/contact`),
  createOwner: (input: unknown) =>
    call<{ ownerId: string; petId: string; linkToken: string }>('/api/owners', { method: 'POST', body: JSON.stringify(input) }),
  runNow: () =>
    call<{ result: { sent: number; skipped: number; failed: number; queued: number; deferred?: string } }>('/api/run-now', {
      method: 'POST',
    }),
};
