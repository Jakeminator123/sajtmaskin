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
  deliveryMode?: "queued" | "provider_missing" | "failed";
}

interface VerificationEmailOptions {
  name?: string | null;
  baseUrl?: string;
}

/**
 * Send an email-verification link to a newly registered user.
 * Returns `{ success: true }` when the email was queued or when
 * the email provider is not configured (dev/test environments).
 */
export async function sendVerificationEmail(
  to: string,
  token: string,
  options: VerificationEmailOptions = {},
): Promise<SendEmailResult> {
  const resend = getResend();
  const baseUrl = (options.baseUrl || URLS.baseUrl).replace(/\/+$/, "");
  const displayName = options.name || to;

  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  // When Resend is not configured, log the link for local testing.
  // Return success=false so API responses can truthfully tell users
  // that no email was actually delivered.
  if (!resend) {
    console.log(
      `[Email] Resend not configured – verification link for ${to}:\n  ${verifyUrl}`,
    );
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
      subject: "Bekräfta din e-postadress – Sajtmaskin",
      html: buildVerificationHtml(displayName, verifyUrl),
    });

    if (error) {
      console.error("[Email] Failed to send verification:", error);
      return { success: false, error: error.message, deliveryMode: "failed" };
    }

    return { success: true, id: data?.id, deliveryMode: "queued" };
  } catch (err) {
    console.error("[Email] Unexpected error:", err);
    return {
      success: false,
      deliveryMode: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
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
