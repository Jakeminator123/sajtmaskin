import { NextRequest } from 'next/server';
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured,
} from '@/lib/paddle/supabase-server';
import { getPaddleInstance, isPaddleConfigured } from '@/lib/paddle/get-paddle-instance';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/paddle/supabase-admin';

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('could not find the table');
}

export async function POST(_request: NextRequest) {
  if (
    !isSupabaseAdminConfigured() ||
    !isSupabaseServerConfigured() ||
    !isPaddleConfigured()
  ) {
    return Response.json({ error: 'subscriptions-not-configured' }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Derive Paddle ids server-side from the host's `subscriptions` row keyed by
  // `user_id` (see instructions.md — the dossier does NOT trust client input).
  const { data: row, error: lookupError } = await getSupabaseAdmin()
    .from('subscriptions')
    .select('paddle_customer_id, paddle_subscription_id')
    .eq('user_id', user.id)
    .not('paddle_customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    if (isMissingTableError(lookupError)) {
      return Response.json({ error: 'subscriptions-table-missing' }, { status: 503 });
    }
    return Response.json({ error: 'subscriptions-lookup-failed' }, { status: 500 });
  }

  const customerId = row?.paddle_customer_id;
  if (!customerId || typeof customerId !== 'string') {
    return Response.json({ error: 'no-paddle-customer-for-user' }, { status: 404 });
  }

  const subscriptionIds =
    typeof row?.paddle_subscription_id === 'string' && row.paddle_subscription_id
      ? [row.paddle_subscription_id]
      : [];

  const paddle = getPaddleInstance();
  const session = await paddle.customerPortalSessions.create(customerId, subscriptionIds);

  return Response.json({ url: session.urls.general.overview });
}
