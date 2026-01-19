import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertV0Key, v0 } from '@/lib/v0';
import { withRateLimit } from '@/lib/rateLimit';

const createLinkedVercelProjectSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
});

export async function GET(req: Request) {
  return withRateLimit(req, 'integrations:vercel:projects:find', async () => {
    try {
      assertV0Key();
      const result = await v0.integrations.vercel.projects.find();
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: Request) {
  return withRateLimit(req, 'integrations:vercel:projects:create', async () => {
    try {
      assertV0Key();

      const body = await req.json().catch(() => ({}));
      const validationResult = createLinkedVercelProjectSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validationResult.error.issues },
          { status: 400 }
        );
      }

      const result = await v0.integrations.vercel.projects.create(validationResult.data);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      );
    }
  });
}
