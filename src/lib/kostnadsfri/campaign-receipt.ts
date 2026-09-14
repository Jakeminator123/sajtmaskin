import { createHmac, timingSafeEqual } from "node:crypto";
import { SECRETS } from "@/lib/config";

export const KOSTNADSFRI_CAMPAIGN_COOKIE = "sajtmaskin_kostnadsfri_campaign";
export const KOSTNADSFRI_CAMPAIGN_RECEIPT_MAX_AGE = 7 * 24 * 60 * 60;

type CampaignReceiptPayload = {
  slug: string;
  sessionId: string;
  expiresAt: number;
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
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const payload: CampaignReceiptPayload = {
    slug: input.slug,
    sessionId: input.sessionId,
    expiresAt: Math.floor(now.getTime() / 1000) + KOSTNADSFRI_CAMPAIGN_RECEIPT_MAX_AGE,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyKostnadsfriCampaignReceipt(
  receipt: string | null | undefined,
  expected: { slug: string; sessionId: string; now?: Date },
): boolean {
  if (!receipt) return false;
  const [encoded, signature, extra] = receipt.split(".");
  if (!encoded || !signature || extra) return false;
  try {
    const expectedSignature = sign(encoded);
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expectedSignature);
    if (
      actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) {
      return false;
    }
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<CampaignReceiptPayload>;
    const nowSeconds = Math.floor((expected.now ?? new Date()).getTime() / 1000);
    return (
      payload.slug === expected.slug &&
      payload.sessionId === expected.sessionId &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt >= nowSeconds
    );
  } catch {
    return false;
  }
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
