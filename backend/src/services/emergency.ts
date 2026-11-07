import type { ClinicSettings } from '../settings.js';

export interface EmergencyContact {
  name: string;
  phone?: string;
  address?: string;
}

/**
 * The clinic's configured partner emergency hospital always wins. Otherwise we ask
 * OpenStreetMap (free Overpass API) for a 24/7 or emergency vet near the clinic.
 */
export async function findEmergencyVet(s: ClinicSettings): Promise<EmergencyContact | null> {
  if (s.er_name) return { name: s.er_name, phone: s.er_phone ?? undefined, address: s.er_address ?? undefined };
  if (s.clinic_lat == null || s.clinic_lon == null) return null;

  const query = `[out:json][timeout:10];
    nwr["amenity"="veterinary"](around:25000,${s.clinic_lat},${s.clinic_lon});
    out tags center 40;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'clinic-companion' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { elements: { tags?: Record<string, string> }[] };
    const candidates = data.elements
      .map((e) => e.tags ?? {})
      .filter((t) => t.name && (t.opening_hours === '24/7' || t.emergency === 'yes' || /emergency|24/i.test(t.name)));
    const best = candidates[0];
    if (!best) return null;
    const address = [best['addr:housenumber'], best['addr:street'], best['addr:city']].filter(Boolean).join(' ');
    return { name: best.name, phone: best.phone ?? best['contact:phone'], address: address || undefined };
  } catch {
    return null;
  }
}
