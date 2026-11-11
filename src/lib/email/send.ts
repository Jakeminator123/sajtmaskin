/**
 * Email service using Resend.
 *
 * Sends transactional emails (verification, password reset, etc.).
 * Gracefully no-ops when RESEND_API_KEY is not configured so local
 * development works without an email provider.
 */

import { Resend } from "resend";
import { SECRETS, URLS } from "@/lib/config";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!SECRETS.resendApiKey) return null;
  if (!_resend) {
    _resend = new Resend(SECRETS.resendApiKey);
  }
  return _resend;
}

// ─── Public helpers ───────────────────────────────────────────────

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
  deliveryMode?:
    | "queued"
    | "provider_missing"
    | "failed"
    | "recipient_restricted"
    | "sender_not_verified";
}

interface VerificationEmailOptions {
  name?: string | null;
  baseUrl?: string;
  returnTo?: string | null;
}

/**
 * Send an email-verification link to a newly registered user.
 * Returns `{ success: true }` only when the email was queued.
 * When the provider is missing in dev/test, returns `success: false`
 * with `deliveryMode: "provider_missing"` and logs the link.
 */
export async function sendVerificationEmail(
  to: string,
  token: string,
  options: VerificationEmailOptions = {},
): Promise<SendEmailResult> {
  const baseUrl = (options.baseUrl || URLS.baseUrl).replace(/\/+$/, "");
  const displayName = options.name || to;

  const verifyUrl = new URL(`${baseUrl}/api/auth/verify-email`);
  verifyUrl.searchParams.set("token", token);
  if (options.returnTo) {
    verifyUrl.searchParams.set("returnTo", options.returnTo);
  }
  const verifyHref = verifyUrl.toString();

  return sendTransactionalEmail({
    to,
    kind: "verification",
    link: verifyHref,
    subject: "Bekräfta din e-postadress – Sajtmaskin",
    html: buildVerificationHtml(displayName, verifyHref),
  });
}

interface PasswordResetEmailOptions {
  name?: string | null;
  baseUrl?: string;
  /** Hur länge länken gäller, i minuter (visas i mejlet). */
  validMinutes: number;
}

/**
 * Skicka en engångslänk för att välja nytt lösenord. Länken går via
 * `/api/auth/reset-password`, som flyttar token till en httpOnly-cookie
 * innan sidan visas.
 */
export async function sendPasswordResetEmail(
  to: string,
  token: string,
  options: PasswordResetEmailOptions,
): Promise<SendEmailResult> {
  const baseUrl = (options.baseUrl || URLS.baseUrl).replace(/\/+$/, "");
  const displayName = options.name || to;
  const resetUrl = new URL(`${baseUrl}/api/auth/reset-password`);
  resetUrl.searchParams.set("token", token);
  const resetHref = resetUrl.toString();

  return sendTransactionalEmail({
    to,
    kind: "password reset",
    link: resetHref,
    subject: "Välj ett nytt lösenord – Sajtmaskin",
    html: buildPasswordResetHtml(displayName, resetHref, options.validMinutes),
  });
}

/**
 * Gemensam leverans: `.invalid`-adresser skickas aldrig, saknad provider
 * loggar länken lokalt och svarar `provider_missing`, providerfel klassas.
 */
async function sendTransactionalEmail(input: {
  to: string;
  kind: string;
  link: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const { to, kind, link, subject, html } = input;
  // Kampanjkonton bär en `.invalid`-adress (RFC 2606) som aldrig kan ta emot post.
  if (to.trim().toLowerCase().endsWith(".invalid")) {
    return { success: false, deliveryMode: "failed", error: "Recipient cannot receive email" };
  }
  const resend = getResend();

  // When Resend is not configured, log the link for local testing.
  // Return success=false so API responses can truthfully tell users
  // that no email was actually delivered.
  if (!resend) {
    console.info(`[Email] Resend not configured – ${kind} link for ${to}:\n  ${link}`);
    return {
      success: false,
      deliveryMode: "provider_missing",
      error: "Email provider is not configured",
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: SECRETS.emailFrom,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[Email] Failed to send ${kind}:`, error);
      return {
        success: false,
        error: error.message,
        deliveryMode: classifyProviderDeliveryMode(error.message),
      };
    }

    return { success: true, id: data?.id, deliveryMode: "queued" };
  } catch (err) {
    console.error("[Email] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      deliveryMode: classifyProviderDeliveryMode(message),
      error: message,
    };
  }
}

// ─── HTML template ────────────────────────────────────────────────

function buildVerificationHtml(displayName: string, verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <h2 style="margin-bottom: 8px;">Välkommen till Sajtmaskin!</h2>
  <p>Hej ${displayName},</p>
  <p>Klicka på knappen nedan för att bekräfta din e-postadress:</p>
  <p style="text-align:center; margin: 32px 0;">
    <a href="${verifyUrl}"
       style="background:#18181b; color:#fff; padding:12px 32px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">
      Bekräfta e-post
    </a>
  </p>
  <p style="font-size:13px; color:#666;">
    Om knappen inte fungerar, kopiera denna länk till din webbläsare:<br/>
    <a href="${verifyUrl}" style="color:#2563eb; word-break:break-all;">${verifyUrl}</a>
  </p>
  <p style="font-size:13px; color:#666;">Länken är giltig i 24 timmar.</p>
  <hr style="border:none; border-top:1px solid #e5e5e5; margin:24px 0;" />
  <p style="font-size:12px; color:#999;">Du får detta mejl för att någon registrerade ett konto med din e-postadress på Sajtmaskin. Om det inte var du kan du ignorera detta mejl.</p>
</body>
</html>`.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPasswordResetHtml(displayName: string, resetUrl: string, validMinutes: number): string {
  const name = escapeHtml(displayName);
  const href = escapeHtml(resetUrl);
  return `
<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <h2 style="margin-bottom: 8px;">Välj ett nytt lösenord</h2>
  <p>Hej ${name},</p>
  <p>Någon bad om att få byta lösenord för ditt konto på Sajtmaskin. Klicka på knappen för att välja ett nytt:</p>
  <p style="text-align:center; margin: 32px 0;">
    <a href="${href}"
       style="background:#18181b; color:#fff; padding:12px 32px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">
      Välj nytt lösenord
    </a>
  </p>
  <p style="font-size:13px; color:#666;">
    Om knappen inte fungerar, kopiera denna länk till din webbläsare:<br/>
    <a href="${href}" style="color:#2563eb; word-break:break-all;">${href}</a>
  </p>
  <p style="font-size:13px; color:#666;">Länken gäller i ${validMinutes} minuter och kan bara användas en gång.</p>
  <hr style="border:none; border-top:1px solid #e5e5e5; margin:24px 0;" />
  <p style="font-size:12px; color:#999;">Om det inte var du som bad om detta kan du ignorera mejlet. Ditt lösenord ändras inte förrän du väljer ett nytt via länken.</p>
</body>
</html>`.trim();
}

function classifyProviderDeliveryMode(message: string): SendEmailResult["deliveryMode"] {
  const normalized = message.toLowerCase();

  // Resend testing mode: only account owner/verified recipients are allowed.
  if (
    normalized.includes("testing emails") ||
    normalized.includes("sandbox") ||
    normalized.includes("can only send to")
  ) {
    return "recipient_restricted";
  }

  // Sender domain/address not verified in provider.
  if (
    normalized.includes("domain is not verified") ||
    normalized.includes("verify a domain") ||
    (normalized.includes("from") && normalized.includes("not verified"))
  ) {
    return "sender_not_verified";
  }

  return "failed";
}
