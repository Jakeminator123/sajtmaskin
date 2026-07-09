import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPaddleInstance, isPaddleConfigured } from '@/lib/paddle/get-paddle-instance';
import { isSupabaseAdminConfigured } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  // Config guard before touching any client. Missing Supabase/Paddle env
  // degrades to a recognizable 503 instead of throwing (createSupabaseServerClient
  // / new Paddle would otherwise 500 on empty env).
  if (!isSupabaseAdminConfigured() || !isPaddleConfigured()) {
    return Response.json({ error: 'subscriptions-not-configured' }, { status: 503 });
  }

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

  // SECURITY NOTE (host-app responsibility): this trusts a client-provided
  // Paddle customerId. In production you MUST authorize it against the
  // signed-in user via your own user↔Paddle-customer mapping (see
  // instructions.md "How to integrate" / "Avoid") — otherwise a signed-in user
  // could open another customer's billing portal. Derive the id server-side
  // from the `subscriptions` row / mapping table instead of the request body.
  const paddle = getPaddleInstance();
  const session = await paddle.customerPortalSessions.create({
    customerId,
  });

  return Response.json({ url: session.urls.general.overview });
}
