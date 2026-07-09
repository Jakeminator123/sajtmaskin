import { getSupabaseAdmin } from '@/lib/paddle/supabase-admin';

type PaddleWebhookEvent = {
  eventType?: string;
  data?: Record<string, unknown>;
};

/**
 * Outcome of processing one webhook event, so the route can pick the right
 * HTTP status without leaking internals:
 *  - `ok`                          → synced (2xx)
 *  - `skipped`                     → not a subscription event / missing ids (2xx)
 *  - `subscriptions-table-missing` → host app has not provisioned the
 *                                    `subscriptions` table yet → route returns 503
 */
export type ProcessWebhookOutcome = 'ok' | 'skipped' | 'subscriptions-table-missing';

function getSubscriptionId(data: Record<string, unknown>) {
  const id = data.id;
  return typeof id === 'string' ? id : null;
}

function getCustomerId(data: Record<string, unknown>) {
  // The Paddle Node SDK normalizes verified webhook payloads to camelCase
  // (`customerId`); accept the snake_case `customer_id` too for raw/forwarded
  // payloads (Codex P1 dossier-batch: reading only snake_case stored null and
  // made the customer-portal route return no-paddle-customer-for-user).
  const customer = data.customerId ?? data.customer_id;
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

/**
 * Detects the "the `subscriptions` table does not exist yet" case so the route
 * can surface a recognizable 503 (setup gap) instead of a 500 (outage). Covers
 * Postgres `42P01` (undefined_table) and the PostgREST schema-cache miss.
 */
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('could not find the table');
}

export class ProcessWebhook {
  async processEvent(event: PaddleWebhookEvent): Promise<ProcessWebhookOutcome> {
    const eventType = event.eventType ?? '';
    const data = event.data ?? {};

    if (!eventType.startsWith('subscription.')) {
      return 'skipped';
    }

    const subscriptionId = getSubscriptionId(data);
    const customerId = getCustomerId(data);
    const status = mapStatus(eventType, data);

    if (!subscriptionId || !status) {
      return 'skipped';
    }

    // Lazy admin client — never constructed at module load. The route has
    // already checked isSupabaseAdminConfigured() before we get here.
    const { error } = await getSupabaseAdmin()
      .from('subscriptions')
      .upsert(
        {
          paddle_subscription_id: subscriptionId,
          paddle_customer_id: customerId,
          status,
          updated_at: new Date().toISOString(),
          raw_payload: data,
        },
        {
          onConflict: 'paddle_subscription_id',
        },
      );

    if (error) {
      if (isMissingTableError(error)) {
        return 'subscriptions-table-missing';
      }
      // A genuine write failure (constraint, connectivity) is a real server
      // fault — throw so the route translates it to 500.
      throw new Error(`subscriptions upsert failed: ${error.message ?? 'unknown error'}`);
    }

    return 'ok';
  }
}
