// Firebase Admin REST fetch — service account JWT auth
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { serviceAccount: unknown; rtdbUrl: string; path?: string };
    const { serviceAccount, rtdbUrl, path = '/clients' } = body;
    if (!serviceAccount || !rtdbUrl) {
      return NextResponse.json({ error: 'serviceAccount and rtdbUrl required' }, { status: 400 });
    }
    const sa = (typeof serviceAccount === 'string' ? JSON.parse(serviceAccount) : serviceAccount) as Record<string, string>;
    if (sa.type !== 'service_account' || !sa.private_key || !sa.client_email) {
      return NextResponse.json({ error: 'Invalid service account JSON' }, { status: 400 });
    }
    const token = await getAccessToken(sa);
    const base = rtdbUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
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
