import { type NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !url.startsWith('https://')) {
    return Response.json({ error: 'url param required' }, { status: 400 });
  }

  const base = url.replace(/\/$/, '');
  const result: Record<string, unknown> = {};

  // 1. shallow root — get all top-level keys
  try {
    const r = await fetch(`${base}/.json?shallow=true`, { signal: AbortSignal.timeout(8000) });
    result['root_keys'] = r.ok ? await r.json() : `HTTP ${r.status}`;
  } catch (e) { result['root_keys'] = String(e); }

  // 2. devices path — first entry full
  try {
    const r = await fetch(`${base}/devices.json?limitToFirst=1`, { signal: AbortSignal.timeout(8000) });
    result['devices_first'] = r.ok ? await r.json() : `HTTP ${r.status}`;
  } catch (e) { result['devices_first'] = String(e); }

  // 3. devices count (shallow)
  try {
    const r = await fetch(`${base}/devices.json?shallow=true`, { signal: AbortSignal.timeout(8000) });
    const d = r.ok ? await r.json() : null;
    result['devices_count'] = d && typeof d === 'object' ? Object.keys(d).length : d;
  } catch (e) { result['devices_count'] = String(e); }

  return Response.json(result);
}
