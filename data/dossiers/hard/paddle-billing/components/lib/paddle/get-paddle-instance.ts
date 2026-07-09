import { Environment, Paddle } from '@paddle/paddle-node-sdk';

/**
 * F2/preview injects placeholder stubs and copied `.env` files often carry
 * similar values; calling Paddle with those yields opaque 500s instead of the
 * calm not-configured path. Mirrors the shared stub vocabulary
 * (`placeholder` / `not_real` / `dummy`).
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

/**
 * True only when a real-looking Paddle API key is configured (non-empty,
 * non-placeholder). Callers MUST check this before getPaddleInstance() and
 * degrade to a 503 'subscriptions-not-configured' when it is false.
 */
export function isPaddleConfigured(): boolean {
  return !isPlaceholderValue(process.env.PADDLE_API_KEY);
}

/** True when the Paddle webhook signing secret is a real (non-placeholder) value. */
export function isPaddleWebhookConfigured(): boolean {
  return !isPlaceholderValue(process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET);
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
    // Placeholder-aware (bugbot medium): generated code that reaches this
    // factory without the route guard must still never construct a real Paddle
    // client from an F2 preview stub.
    if (!apiKey || isPlaceholderValue(apiKey)) {
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
