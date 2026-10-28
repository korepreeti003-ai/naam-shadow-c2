import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, requireRole, apiError, unauthorized, forbidden } from '@/lib/auth';
import { parseCsvBuffer } from '@/lib/csv';

export const config = {
  api: { bodyParser: false },
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await verifyRequest(req);
    requireRole(ctx, 'operator');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('No file provided. Send the CSV as "file" in a multipart form.', 400);
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      return apiError('Only CSV files are accepted.', 400);
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB ~= ~10,000 contacts
    if (file.size > maxSize) {
      return apiError('File too large. Maximum 10 MB.', 400);
    }

    const db = getFirestore();

    // Load opted-out numbers for deduplication
    const optedOutSnap = await db.collection(COLLECTIONS.OPTED_OUT).get();
    const optedOutNumbers = new Set(optedOutSnap.docs.map((d) => d.id));

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = parseCsvBuffer(buffer, optedOutNumbers);

    if (result.summary.total === 0) {
      return apiError('CSV file is empty or has no readable rows.', 400);
    }

    // Store batch metadata — contacts are committed on campaign confirmation
    const now = new Date().toISOString();
    const batchRef = await db.collection(COLLECTIONS.CONTACT_BATCHES).add({
      fileName: file.name,
      totalRows: result.summary.total,
      validCount: result.summary.valid,
      invalidCount: result.summary.invalid,
      duplicateCount: result.summary.duplicates,
      optedOutCount: result.summary.optedOut,
      uploadedAt: now,
      uploadedBy: ctx.uid,
      // Preview only — not yet persisted per contact
      preview: result.valid.slice(0, 5),
    });

    return Response.json(
      {
        success: true,
        data: {
          batchId: batchRef.id,
          fileName: file.name,
          summary: result.summary,
          preview: result.valid.slice(0, 20),
          invalidSamples: result.invalid.slice(0, 5),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    if (err instanceof Error && err.message.startsWith('Forbidden')) return forbidden();
    return apiError(err instanceof Error ? err.message : 'Upload failed');
  }
}
