import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, apiError, unauthorized } from '@/lib/auth';

function verifySettingsPassword(req: NextRequest): boolean {
  const token = req.headers.get('x-settings-token');
  const correct = process.env.SETTINGS_PASSWORD;
  return !!correct && token === correct;
}

async function fetchRtdb(rtdbUrl: string, path: string) {
  const base = rtdbUrl.replace(/\/$/, '');
  const url = `${base}/${path}.json`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`RTDB fetch failed: ${res.status}`);
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    await verifyRequest(req);
    if (!verifySettingsPassword(req)) return apiError('Settings locked', 403);

    const { projectDocId, devicesPath } = await req.json() as {
      projectDocId: string;
      devicesPath?: string;
    };

    if (!projectDocId) return apiError('projectDocId required', 400);

    const db = getFirestore();
    const projectDoc = await db.collection(COLLECTIONS.PROJECTS).doc(projectDocId).get();
    if (!projectDoc.exists) return apiError('Project not found', 404);

    const project = projectDoc.data()!;
    if (!project.rtdbUrl) return apiError('This project has no RTDB URL configured', 400);

    const path = (devicesPath ?? project.devicesPath ?? 'devices').replace(/^\/|\/$/g, '');
    const data = await fetchRtdb(project.rtdbUrl, path);

    if (!data || typeof data !== 'object') {
      return Response.json({ success: true, data: { synced: 0, message: 'No devices found at path: ' + path } });
    }

    const now = new Date().toISOString();
    let synced = 0;

    const batch = db.batch();
    for (const [deviceId, raw] of Object.entries(data)) {
      const d = raw as Record<string, unknown>;
      const online = d['online'] === true || d['status'] === 'online' || d['connected'] === true;
      const phone = (d['phoneNumber'] ?? d['phone'] ?? d['number'] ?? d['sim'] ?? '') as string;
      const name = (d['name'] ?? d['model'] ?? d['device'] ?? deviceId) as string;
      const fcmToken = (d['fcmToken'] ?? d['token'] ?? d['registrationToken'] ?? '') as string;

      const ref = db.collection(COLLECTIONS.DEVICES).doc(`${project.projectId}_${deviceId}`);
      batch.set(ref, {
        name: String(name),
        projectId: project.projectId,
        rtdbDeviceId: deviceId,
        fcmToken: String(fcmToken),
        phoneNumber: String(phone),
        model: (d['model'] ?? d['device'] ?? null) as string | null,
        androidVersion: (d['androidVersion'] ?? d['android'] ?? null) as string | null,
        status: online ? 'idle' : 'offline',
        lastSeen: (d['lastSeen'] ?? d['last_seen'] ?? now) as string,
        messagesSent: (d['messagesSent'] ?? 0) as number,
        messagesDelivered: (d['messagesDelivered'] ?? 0) as number,
        messagesFailed: (d['messagesFailed'] ?? 0) as number,
        capabilities: ['sms'],
        rtdbPath: path,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
      synced++;
    }
    await batch.commit();

    await projectDoc.ref.update({ devicesPath: path, updatedAt: now });

    return Response.json({ success: true, data: { synced, path } });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Sync failed');
  }
}
