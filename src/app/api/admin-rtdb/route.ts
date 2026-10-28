// Generic Firebase RTDB read/write via service account
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAccessToken } from '@/lib/firebase-admin-jwt';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      serviceAccount: unknown;
      rtdbUrl: string;
      path: string;
      method?: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE';
      data?: unknown;
    };
    const { serviceAccount, rtdbUrl, path = '/', method = 'GET', data } = body;
    if (!serviceAccount || !rtdbUrl) {
      return NextResponse.json({ error: 'serviceAccount and rtdbUrl required' }, { status: 400 });
    }
    const sa = (typeof serviceAccount === 'string' ? JSON.parse(serviceAccount) : serviceAccount) as Record<string, string>;
    const token = await getFirebaseAccessToken(sa);
    const base = rtdbUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${base}${cleanPath}.json?access_token=${token}`;

    const opts: RequestInit = { method, signal: AbortSignal.timeout(12000) };
    if (data !== undefined && method !== 'GET' && method !== 'DELETE') {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(data);
    }

    const res = await fetch(url, opts);
    if (!res.ok) return NextResponse.json({ error: `RTDB HTTP ${res.status}` }, { status: res.status });
    const result = res.status === 204 ? null : await res.json();
    return NextResponse.json({ data: result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
