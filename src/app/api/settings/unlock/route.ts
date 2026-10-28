import { type NextRequest } from 'next/server';
import { apiError } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json() as { password?: string };
    const correct = process.env.SETTINGS_PASSWORD;
    if (!correct) return apiError('SETTINGS_PASSWORD not configured', 500);
    if (password !== correct) {
      return apiError('Wrong password', 401);
    }
    return Response.json({ success: true });
  } catch {
    return apiError('Invalid request', 400);
  }
}
