import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, apiError, unauthorized } from '@/lib/auth';

function verifySettingsPassword(req: NextRequest): boolean {
  const token = req.headers.get('x-settings-token');
  const correct = process.env.SETTINGS_PASSWORD;
  return !!correct && token === correct;
}

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    if (!verifySettingsPassword(req)) return apiError('Settings locked', 403);

    const db = getFirestore();
    const snap = await db.collection(COLLECTIONS.PROJECTS).orderBy('createdAt', 'desc').get();
    const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return Response.json({ success: true, data: projects });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed');
  }
}

export async function POST(req: NextRequest) {
  try {
    await verifyRequest(req);
    if (!verifySettingsPassword(req)) return apiError('Settings locked', 403);

    const body = await req.json() as {
      name: string;
      projectId: string;
      serviceAccountJson?: string;
      rtdbUrl?: string;
      notes?: string;
    };

    if (!body.name || !body.projectId) {
      return apiError('name and projectId are required', 400);
    }

    // Validate service account JSON if provided
    if (body.serviceAccountJson) {
      try { JSON.parse(body.serviceAccountJson); } catch {
        return apiError('Invalid service account JSON', 400);
      }
    }

    const db = getFirestore();
    const now = new Date().toISOString();
    const ref = await db.collection(COLLECTIONS.PROJECTS).add({
      name: body.name.trim(),
      projectId: body.projectId.trim(),
      serviceAccountJson: body.serviceAccountJson?.trim() ?? null,
      rtdbUrl: body.rtdbUrl?.trim() ?? null,
      notes: body.notes?.trim() ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return Response.json({ success: true, data: { id: ref.id } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await verifyRequest(req);
    if (!verifySettingsPassword(req)) return apiError('Settings locked', 403);

    const { id } = await req.json() as { id: string };
    if (!id) return apiError('id is required', 400);

    const db = getFirestore();
    await db.collection(COLLECTIONS.PROJECTS).doc(id).delete();
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed');
  }
}
