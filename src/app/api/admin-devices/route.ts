// Firebase Admin REST fetch — service account JWT auth + multi-path probe
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function b64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pay = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const msg = `${hdr}.${pay}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(msg);
  const sig = signer.sign(sa.private_key, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${msg}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OAuth2 ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json() as { access_token: string };
  return json.access_token;
}

async function rtdbGet(base: string, path: string, token: string): Promise<unknown> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${cleanPath}.json?access_token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  return res.json();
}

// Known RTDB paths where Android RAT apps store devices
const DEVICE_PATHS = [
  '/clients',
  '/devices',
  '/users',
  '/data',
  '/phones',
  '/android',
  '/bots',
  '/infected',
  '/victims',
  '/nodes',
  '/agents',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      serviceAccount: unknown;
      rtdbUrl: string;
      path?: string;
      multiPath?: boolean;
    };
    const { serviceAccount, rtdbUrl, path, multiPath = false } = body;

    if (!serviceAccount || !rtdbUrl) {
      return NextResponse.json({ error: 'serviceAccount and rtdbUrl required' }, { status: 400 });
    }

    const sa = (typeof serviceAccount === 'string'
      ? JSON.parse(serviceAccount)
      : serviceAccount) as Record<string, string>;

    if (sa.type !== 'service_account' || !sa.private_key || !sa.client_email) {
      return NextResponse.json({ error: 'Invalid service account JSON' }, { status: 400 });
    }

    const token = await getAccessToken(sa);
    const base = rtdbUrl.replace(/\/$/, '');

    if (multiPath) {
      // Try all known paths and merge results
      const results = await Promise.allSettled(
        DEVICE_PATHS.map(p => rtdbGet(base, p, token))
      );

      const found: Record<string, { path: string; data: unknown }> = {};
      const pathResults: Record<string, unknown> = {};

      for (let i = 0; i < DEVICE_PATHS.length; i++) {
        const r = results[i];
        const p = DEVICE_PATHS[i];
        if (r.status === 'fulfilled' && r.value && typeof r.value === 'object' && !Array.isArray(r.value)) {
          const entries = Object.entries(r.value as Record<string, unknown>);
          if (entries.length > 0) {
            pathResults[p] = r.value;
            for (const [id, val] of entries) {
              if (val && typeof val === 'object') {
                found[id] = { path: p, data: val };
              }
            }
          }
        }
      }

      // Also try root shallow to find unlisted paths
      try {
        const rootRes = await rtdbGet(base, '/', token + '&shallow=true');
        return NextResponse.json({
          data: found,
          pathResults,
          rootKeys: rootRes && typeof rootRes === 'object' ? Object.keys(rootRes as object) : [],
          activePaths: Object.keys(pathResults),
        });
      } catch {
        return NextResponse.json({
          data: found,
          pathResults,
          rootKeys: [],
          activePaths: Object.keys(pathResults),
        });
      }
    }

    // Single path fetch
    const fetchPath = path ?? '/clients';
    const cleanPath = fetchPath.startsWith('/') ? fetchPath : `/${fetchPath}`;
    const rtdbRes = await fetch(`${base}${cleanPath}.json?access_token=${token}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!rtdbRes.ok) {
      return NextResponse.json({ error: `RTDB HTTP ${rtdbRes.status}` }, { status: rtdbRes.status });
    }
    const data = await rtdbRes.json();
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
