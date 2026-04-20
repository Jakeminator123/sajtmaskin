import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPaddleInstance } from '@/lib/paddle/get-paddle-instance';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const customerId = body?.customerId;

  if (!customerId || typeof customerId !== 'string') {
    return Response.json({ error: 'Missing customerId' }, { status: 400 });
  }

  const paddle = getPaddleInstance();
  const session = await paddle.customerPortalSessions.create({
    customerId,
  });

  return Response.json({ url: session.urls.general.overview });
}
