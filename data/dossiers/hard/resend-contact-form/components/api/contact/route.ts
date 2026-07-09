import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";

interface ContactPayload {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * F2/preview injects the stub `re_placeholder_preview_not_a_real_key`; Resend
 * rejects it, so any placeholder-marked value counts as NOT a real key.
 * Mirrors the stub vocabulary (`placeholder` / `not_real` / `dummy`).
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

function isLikelyValidResendApiKey(key: string | undefined): key is string {
  if (!key) return false;
  return key.startsWith("re_") && !isPlaceholderValue(key);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.CONTACT_EMAIL_TO;

  // Validate first so demo mode behaves exactly like the real path (same 400 /
  // 422 responses) — only the final delivery is faked when no real key is set.
  let payload: ContactPayload;
  try {
    payload = (await request.json()) as ContactPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  const name = asTrimmedString(payload.name);
  const email = asTrimmedString(payload.email);
  const subject = asTrimmedString(payload.subject) || "Contact form submission";
  const message = asTrimmedString(payload.message);

  if (!name || !email || !message) {
    return NextResponse.json(
      { ok: false, error: "missing-required-fields" },
      { status: 422 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "invalid-email" },
      { status: 422 },
    );
  }
  if (message.length > 5000) {
    return NextResponse.json(
      { ok: false, error: "message-too-long" },
      { status: 422 },
    );
  }

  // Demo/mock mode (mock: success): no real Resend key (missing or an F2
  // preview stub) → return a believable success with `demo: true` so the form
  // shows a "not really sent" notice. The visual flow works in preview without
  // real credentials; real delivery happens only once a genuine `re_...` key
  // is configured.
  if (!isLikelyValidResendApiKey(apiKey)) {
    return NextResponse.json({ ok: true, demo: true });
  }

  // Genuine configuration error: a real key is set but the sender/recipient
  // addresses are missing. Keep the calm not-configured path (503) so the form
  // shows the setup notice for the missing address keys — not a demo success.
  if (!from || !to) {
    return NextResponse.json(
      { ok: false, error: "email-not-configured" },
      { status: 503 },
    );
  }

  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject,
      text: `From: ${name} <${email}>\n\n${message}`,
    });
    if ("error" in result && result.error) {
      console.error("[contact] Resend error", result.error);
      return NextResponse.json(
        { ok: false, error: "send-failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] Unexpected error", err);
    return NextResponse.json(
      { ok: false, error: "send-failed" },
      { status: 502 },
    );
  }
}
