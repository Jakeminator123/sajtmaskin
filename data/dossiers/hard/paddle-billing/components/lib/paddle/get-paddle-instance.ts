import { Environment, Paddle } from '@paddle/paddle-node-sdk';

/**
 * True only when a real-looking Paddle API key is configured. F2 design
 * previews and copied `.env` files often carry placeholder values; calling
 * Paddle with those yields opaque 500s instead of the calm not-configured
 * path, so any placeholder-marked value counts as unconfigured. Callers MUST
 * check this before getPaddleInstance() and degrade to a 503 when it is false.
 */
export function isPaddleConfigured(): boolean {
  const key = process.env.PADDLE_API_KEY?.trim();
  if (!key) return false;
  return !key.toLowerCase().includes('placeholder');
}

/** True when the Paddle webhook signing secret is present (non-placeholder). */
export function isPaddleWebhookConfigured(): boolean {
  const secret = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  return !secret.toLowerCase().includes('placeholder');
}

let paddleInstance: Paddle | null = null;

/**
 * Lazy Paddle SDK singleton. Constructed AFTER the caller's isPaddleConfigured()
 * env guard — never at module import time — so a missing key degrades to a JSON
 * 503 in the route instead of throwing during import/build. Throws a
 * recognizable error if reached while unconfigured (defensive; the route guard
 * should make that unreachable).
 */
export function getPaddleInstance(): Paddle {
  if (!paddleInstance) {
    const apiKey = process.env.PADDLE_API_KEY;
    if (!apiKey) {
      throw new Error('subscriptions-not-configured: PADDLE_API_KEY is missing');
    }
    paddleInstance = new Paddle(apiKey, {
      environment:
        process.env.NEXT_PUBLIC_PADDLE_ENV === 'production'
          ? Environment.production
          : Environment.sandbox,
    });
  }
  return paddleInstance;
}
