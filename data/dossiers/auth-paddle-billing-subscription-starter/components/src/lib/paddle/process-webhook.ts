import { supabaseAdmin } from '../supabase/admin';

type PaddleWebhookEvent = {
  eventType?: string;
  data?: Record<string, unknown>;
};

function getSubscriptionId(data: Record<string, unknown>) {
  const id = data.id;
  return typeof id === 'string' ? id : null;
}

function getCustomerId(data: Record<string, unknown>) {
  const customer = data.customer_id;
  return typeof customer === 'string' ? customer : null;
}

function mapStatus(eventType: string, data: Record<string, unknown>) {
  const explicitStatus = data.status;
  if (typeof explicitStatus === 'string') return explicitStatus;

  switch (eventType) {
    case 'subscription.canceled':
      return 'canceled';
    case 'subscription.paused':
      return 'paused';
    case 'subscription.resumed':
    case 'subscription.activated':
    case 'subscription.created':
    case 'subscription.updated':
      return 'active';
    default:
      return null;
  }
}

export class ProcessWebhook {
  async processEvent(event: PaddleWebhookEvent) {
    const eventType = event.eventType ?? '';
    const data = event.data ?? {};

    if (!eventType.startsWith('subscription.')) {
      return;
    }

    const subscriptionId = getSubscriptionId(data);
    const customerId = getCustomerId(data);
    const status = mapStatus(eventType, data);

    if (!subscriptionId || !status) {
      return;
    }

    await supabaseAdmin.from('subscriptions').upsert(
      {
        paddle_subscription_id: subscriptionId,
        paddle_customer_id: customerId,
        status,
        updated_at: new Date().toISOString(),
        raw_payload: data,
      },
      {
        onConflict: 'paddle_subscription_id',
      }
    );
  }
}
