import { NextRequest } from 'next/server';
import { ProcessWebhook } from '@/lib/paddle/process-webhook';
import {
  getPaddleInstance,
  isPaddleConfigured,
  isPaddleWebhookConfigured,
} from '@/lib/paddle/get-paddle-instance';
import { isSupabaseAdminConfigured } from '@/lib/supabase/admin';

// ProcessWebhook is env-free at construction (it lazy-inits the Supabase admin
// client only when it actually writes), so instantiating it at module scope is
// safe and never crashes on missing env.
const webhookProcessor = new ProcessWebhook();

export async function POST(request: NextRequest) {
  // Config guard FIRST. Without the Paddle key + signing secret we cannot
  // verify the signature at all, and without the Supabase admin env we cannot
  // sync. Degrade to a recognizable 503 instead of running unmarshal with empty
  // values (which throws and would surface as a 500 / fake outage).
  if (!isPaddleConfigured() || !isPaddleWebhookConfigured() || !isSupabaseAdminConfigured()) {
    return Response.json({ error: 'subscriptions-not-configured' }, { status: 503 });
  }

  const signature = request.headers.get('paddle-signature') ?? '';
  const rawRequestBody = await request.text();
  const privateKey = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET ?? '';

  // Missing signature / empty body is a malformed request, not a server fault.
  if (!signature || !rawRequestBody) {
    return Response.json({ error: 'invalid-signature' }, { status: 400 });
  }

  let eventData;
  try {
    const paddle = getPaddleInstance();
    eventData = await paddle.webhooks.unmarshal(rawRequestBody, privateKey, signature);
  } catch {
    // An invalid signature or a payload that fails verification is a client /
    // auth error — return 401 so a tampered or unsigned webhook is NEVER
    // reported as a 500 (which would look like an outage and trigger endless
    // provider retries). Do not log the raw body/error detail.
    return Response.json({ error: 'invalid-signature' }, { status: 401 });
  }

  if (!eventData) {
    return Response.json({ error: 'invalid-webhook-payload' }, { status: 400 });
  }

  try {
    const outcome = await webhookProcessor.processEvent(eventData);
    if (outcome === 'subscriptions-table-missing') {
      // Verified event, but the host app has not created the `subscriptions`
      // table yet. Surface a recognizable 503 (setup gap) rather than a 500.
      return Response.json({ error: 'subscriptions-table-missing' }, { status: 503 });
    }
    return Response.json({ status: 'ok', eventName: eventData.eventType ?? 'unknown' });
  } catch (e) {
    // A genuine internal failure (unexpected DB/runtime error). Signature and
    // configuration problems were already handled above with 4xx / 503, so a
    // 500 here means a real server fault worth investigating.
    console.error('[paddle-webhook] processing failed', e);
    return Response.json({ error: 'internal-server-error' }, { status: 500 });
  }
}
