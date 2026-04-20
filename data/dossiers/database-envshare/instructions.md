# When to use

Use EnvShare patterns when the product needs to let users or operators share secrets safely without storing plaintext in the database. Typical cases:

- sharing `.env` values between teammates
- sending one-off API credentials during onboarding
- storing an encrypted config blob with short TTL
- building a self-hosted secret handoff flow in Next.js

This dossier is a good fit when:

- the app uses Next.js App Router
- encrypted payloads can be stored in Upstash Redis
- decryption happens only when the recipient already has the secret key or passphrase
- analytics must not leak secret URLs or identifiers

# How to integrate

## 1. Install and configure dependencies

Required packages from this dossier:

```bash
npm install @upstash/redis @vercel/analytics zod
```

Set Upstash environment variables:

```env
UPSTASH_REDIS_REST_URL=https://<your-db>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>
ENABLE_VERCEL_ANALYTICS=true
```

`ENABLE_VERCEL_ANALYTICS` should remain optional.

## 2. Store only encrypted payloads

Do not send plaintext secrets to Redis. Encrypt on the server or in a trusted boundary, then persist only ciphertext.

Use the helper from `components/lib/envshare-crypto.ts`:

```ts
import { encryptSecret, decryptSecret } from "@/components/lib/envshare-crypto";

const ciphertext = await encryptSecret(JSON.stringify({
  DATABASE_URL: process.env.DATABASE_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
}), passphrase);

const plaintext = await decryptSecret(ciphertext, passphrase);
```

The helper uses:

- AES-CBC
- a fresh random IV per encryption
- SHA-256 of the supplied passphrase as the AES key material

If you change the crypto format, keep it backward-compatible or version the payload.

## 3. Add a persistence route backed by Upstash Redis

Use a route like `components/app/api/envshare/[id]/route.ts` to create and fetch encrypted payloads.

Example usage from a server action or client:

```ts
const response = await fetch(`/api/envshare/${id}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ciphertext,
    expiresInSeconds: 1800,
  }),
});
```

Fetch for later decryption:

```ts
const response = await fetch(`/api/envshare/${id}`);
if (!response.ok) throw new Error("Secret not found");
const { ciphertext } = await response.json();
const plaintext = await decryptSecret(ciphertext, passphrase);
```

Redis keys used by this dossier:

- `envshare:doc:<id>` — encrypted payload with TTL
- `envshare:metrics:reads` — count of retrievals
- `envshare:metrics:writes` — count of stored documents

## 4. Use privacy-safe analytics only

If Vercel Analytics is enabled, redact all dynamic secret paths before events are sent.

Pattern:

```tsx
"use client";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";

const allowlist = ["/", "/share", "/deploy", "/unseal"];

export function Analytics() {
  return (
    <VercelAnalytics
      beforeSend={(event) => {
        const url = new URL(event.url);
        if (!allowlist.includes(url.pathname)) {
          url.pathname = "/__redacted";
          return { ...event, url: url.href };
        }
        return event;
      }}
    />
  );
}
```

Mount it conditionally in your root layout or provider tree:

```tsx
{process.env.ENABLE_VERCEL_ANALYTICS ? <Analytics /> : null}
```

## 5. Optionally expose aggregate stats

The `Stats` component demonstrates the server-side access pattern for metrics in Upstash Redis.

```tsx
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function Stats() {
  const [reads, writes] = await redis
    .pipeline()
    .get("envshare:metrics:reads")
    .get("envshare:metrics:writes")
    .exec<[number, number]>();

  return <div>{JSON.stringify({ reads, writes })}</div>;
}
```

This is optional and should only show aggregate counters, never identifiers, secret names, or decrypted content.

## 6. Render user-facing failures clearly

For expired links, wrong passphrases, invalid payloads, or failed fetches, use a minimal error surface like:

```tsx
type Props = { message: string };

export const ErrorMessage = ({ message }: Props) => (
  <div className="flex items-center justify-center my-8">
    <span>{message}</span>
  </div>
);
```

Recommended messages:

- `This secret was not found or has expired.`
- `The passphrase is incorrect.`
- `The encrypted payload is invalid.`
- `Unable to save the secret right now.`

# UX rules

- Never display plaintext secrets after initial reveal unless the user explicitly requests it.
- Prefer short TTLs by default, such as 30 minutes or 24 hours.
- Tell the user clearly whether a secret is expired, missing, or failed to decrypt.
- Keep share links and passphrases separate; do not embed both in the same URL.
- If analytics are enabled, redact any path that may contain an ID or token.
- If you show metrics, only show anonymous aggregate counts.
- If building a one-time-read flow, delete the Redis key immediately after successful retrieval instead of keeping the current GET behavior.

# Avoid

- Do not store raw `.env` content in Redis.
- Do not log plaintext secrets, passphrases, or ciphertext payloads in server logs.
- Do not use route analytics that capture dynamic IDs unchanged.
- Do not hardcode provider branding, social proof, or template-specific footers into the product.
- Do not fetch GitHub stars or marketing stats unless the site explicitly wants promotional content.
- Do not assume Vercel hosting; analytics must be optional.
- Do not treat AES-CBC as authenticated encryption; if integrity guarantees are required, add an HMAC or migrate to AES-GCM.

# Verification

- Confirm `Redis.fromEnv()` works with valid Upstash credentials.
- Create a secret, store it via `POST /api/envshare/[id]`, and verify the Redis value is ciphertext only.
- Fetch it via `GET /api/envshare/[id]` and verify decryption succeeds with the correct passphrase.
- Verify decryption fails with the wrong passphrase and shows a safe error message.
- Verify expired keys return `404` with `Not found or expired`.
- Verify `envshare:metrics:reads` and `envshare:metrics:writes` increment correctly.
- If analytics are enabled, confirm dynamic secret URLs are sent as `/__redacted` rather than the real path.
- Inspect logs and ensure no plaintext secrets or passphrases are emitted.
