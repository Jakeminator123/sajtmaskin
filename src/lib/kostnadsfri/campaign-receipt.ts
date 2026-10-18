import { createHmac, timingSafeEqual } from "node:crypto";
import { SECRETS } from "@/lib/config";

export const KOSTNADSFRI_CAMPAIGN_COOKIE = "sajtmaskin_kostnadsfri_campaign";
export const KOSTNADSFRI_CAMPAIGN_RECEIPT_MAX_AGE = 7 * 24 * 60 * 60;

export type CampaignReceiptPayload = {
  slug: string;
  sessionId: string;
  expiresAt: number;
  mailMessageId?: string;
  mailVariant?: "text" | "animated";
};

function sign(payload: string): string {
  const secret = SECRETS.jwtSecret;
  if (!secret) throw new Error("JWT_SECRET is required for campaign receipts");
  return createHmac("sha256", secret)
    .update(`kostnadsfri-campaign-v1:${payload}`)
    .digest("base64url");
}

export function createKostnadsfriCampaignReceipt(input: {
  slug: string;
  sessionId: string;
  mailMessageId?: string | null;
  mailVariant?: "text" | "animated" | null;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const payload: CampaignReceiptPayload = {
    slug: input.slug,
    sessionId: input.sessionId,
    expiresAt: Math.floor(now.getTime() / 1000) + KOSTNADSFRI_CAMPAIGN_RECEIPT_MAX_AGE,
    ...(input.mailMessageId ? { mailMessageId: input.mailMessageId } : {}),
    ...(input.mailVariant ? { mailVariant: input.mailVariant } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyKostnadsfriCampaignReceipt(
  receipt: string | null | undefined,
  expected: { slug: string; sessionId: string; now?: Date },
): boolean {
  return readVerifiedKostnadsfriCampaignReceipt(receipt, expected) !== null;
}

function parseSignedReceipt(
  receipt: string | null | undefined,
  now: Date,
): CampaignReceiptPayload | null {
  if (!receipt) return null;
  const [encoded, signature, extra] = receipt.split(".");
  if (!encoded || !signature || extra) return null;
  try {
    const expectedSignature = sign(encoded);
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expectedSignature);
    if (
      actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<CampaignReceiptPayload>;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const valid =
      typeof payload.slug === "string" &&
      payload.slug.length > 0 &&
      typeof payload.sessionId === "string" &&
      payload.sessionId.length > 0 &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt >= nowSeconds &&
      (payload.mailMessageId === undefined || /^[a-f0-9]{32}$/.test(payload.mailMessageId)) &&
      (payload.mailVariant === undefined ||
        payload.mailVariant === "text" ||
        payload.mailVariant === "animated");
    return valid ? (payload as CampaignReceiptPayload) : null;
  } catch {
    return null;
  }
}

/** Aktuell inbjudan i den här webbläsaren, oavsett vilken anonym session som skrev kvittot. */
export function readSignedKostnadsfriCampaignReceipt(
  receipt: string | null | undefined,
  now: Date = new Date(),
): CampaignReceiptPayload | null {
  return parseSignedReceipt(receipt, now);
}

export function readVerifiedKostnadsfriCampaignReceipt(
  receipt: string | null | undefined,
  expected: { slug: string; sessionId: string; now?: Date },
): CampaignReceiptPayload | null {
  const payload = parseSignedReceipt(receipt, expected.now ?? new Date());
  if (!payload || payload.slug !== expected.slug || payload.sessionId !== expected.sessionId) {
    return null;
  }
  return payload;
}

export function readKostnadsfriCampaignReceipt(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === KOSTNADSFRI_CAMPAIGN_COOKIE) {
      return valueParts.join("=") || null;
    }
  }
  return null;
}
