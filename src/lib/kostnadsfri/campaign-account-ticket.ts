import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { SECRETS } from "@/lib/config";

const CAMPAIGN_EMAIL_DOMAIN = "kampanj.sajtmaskin.invalid";
const READABLE_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Kampanjkontots e-post: en per sida, så samma lösenord alltid når samma konto.
 * `.invalid` är reserverat (RFC 2606) och kan aldrig ta emot post.
 */
export function kostnadsfriCampaignEmail(slug: string): string {
  const local = READABLE_SLUG.test(slug)
    ? slug
    : createHash("sha256").update(slug).digest("hex").slice(0, 32);
  return `kostnadsfri+${local}@${CAMPAIGN_EMAIL_DOMAIN}`;
}

/**
 * Biljetten för «Spara kontot» bevisar att den här webbläsaren var inloggad som
 * kampanjkontot när kunden bad om att spara det. Inloggningen som följer byter
 * auth-cookien, så biljetten bär kampanjkontots id över den. `__Host-` på HTTPS
 * gör att en subdomän inte kan plantera en egen biljett.
 */
export const CAMPAIGN_CLAIM_COOKIE_HOST = "__Host-sajtmaskin_kampanjkonto";
export const CAMPAIGN_CLAIM_COOKIE_LEGACY = "sajtmaskin_kampanjkonto";
/** Räcker för registrering + e-postverifiering innan inloggningen. */
export const CAMPAIGN_CLAIM_MAX_AGE = 24 * 60 * 60;

export function campaignClaimCookieName(secure: boolean): string {
  return secure ? CAMPAIGN_CLAIM_COOKIE_HOST : CAMPAIGN_CLAIM_COOKIE_LEGACY;
}

type ClaimTicketPayload = { campaignUserId: string; expiresAt: number };

function sign(encoded: string): string {
  const secret = SECRETS.jwtSecret;
  if (!secret) throw new Error("JWT_SECRET is required for campaign claim tickets");
  return createHmac("sha256", secret).update(`kostnadsfri-claim-v1:${encoded}`).digest("base64url");
}

export function createCampaignClaimTicket(campaignUserId: string, now: Date = new Date()): string {
  const payload: ClaimTicketPayload = {
    campaignUserId,
    expiresAt: Math.floor(now.getTime() / 1000) + CAMPAIGN_CLAIM_MAX_AGE,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function readCampaignClaimTicket(
  ticket: string | null | undefined,
  now: Date = new Date(),
): { campaignUserId: string } | null {
  if (!ticket) return null;
  const [encoded, signature, extra] = ticket.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  try {
    const actual = Buffer.from(signature);
    const expected = Buffer.from(sign(encoded));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<ClaimTicketPayload>;
    if (
      typeof payload.campaignUserId !== "string" ||
      !payload.campaignUserId ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt < Math.floor(now.getTime() / 1000)
    ) {
      return null;
    }
    return { campaignUserId: payload.campaignUserId };
  } catch {
    return null;
  }
}
