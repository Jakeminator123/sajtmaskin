/**
 * Canonical cap for `urls` on POST /validate-images.
 *
 * The client hook and the route Zod schema MUST share this number. Zod
 * rejects the whole request above the cap, and the client treats a non-ok
 * response as "no replacements at all" — so a drifted client list would drop
 * every image, not just the overflow.
 *
 * This module is a pure constant: no Zod, no Node/server imports, safe to
 * pull into the builder client bundle.
 */
export const MAX_SCOPED_IMAGE_URLS = 16;
