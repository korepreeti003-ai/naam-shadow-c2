// Returns non-sensitive panel config from env vars for auto-setup
import { NextResponse } from 'next/server';

export async function GET() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const rtdbUrl = process.env.FIREBASE_RTDB_URL ??
    (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      ? `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
      : '');

  if (!saJson && !rtdbUrl) {
    return NextResponse.json({ configured: false });
  }

  let projectId = '';
  let clientEmail = '';

  if (saJson) {
    try {
      const sa = JSON.parse(saJson) as Record<string, string>;
      projectId = sa.project_id ?? '';
      clientEmail = sa.client_email ?? '';
    } catch { /**/ }
  }

  if (!projectId) projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '';

  return NextResponse.json({
    configured: true,
    hasServiceAccount: !!saJson,
    rtdbUrl: rtdbUrl || (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : ''),
    projectId,
    clientEmail,
    serviceAccountJson: saJson ?? null,
  });
}
