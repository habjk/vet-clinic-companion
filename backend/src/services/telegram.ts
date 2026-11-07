/** Thin client for the free Telegram Bot API. */
const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(api(token, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description}`);
}

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Downloads the largest photo size under 4 MB. */
export async function downloadTelegramPhoto(
  token: string,
  sizes: { file_id: string; file_size?: number }[],
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string } | null> {
  const pick = [...sizes].reverse().find((p) => (p.file_size ?? 0) <= MAX_PHOTO_BYTES);
  if (!pick) return null;
  const meta = (await (await fetch(api(token, `getFile?file_id=${encodeURIComponent(pick.file_id)}`))).json()) as {
    ok: boolean;
    result?: { file_path: string };
  };
  if (!meta.ok || !meta.result) return null;
  const file = await fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`);
  if (!file.ok) return null;
  return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: 'image/jpeg' };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}
