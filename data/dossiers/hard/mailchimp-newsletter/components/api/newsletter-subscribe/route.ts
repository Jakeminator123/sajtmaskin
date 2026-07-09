import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

interface SubscribePayload {
  email?: unknown;
}

interface MailchimpMemberResponse {
  status?: string;
  title?: string;
  detail?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveDataCenter(apiKey: string, override: string | undefined): string | null {
  const fromEnv = override?.trim();
  if (fromEnv) return fromEnv;
  const dashIndex = apiKey.lastIndexOf("-");
  if (dashIndex === -1 || dashIndex === apiKey.length - 1) return null;
  return apiKey.slice(dashIndex + 1);
}

function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***@${email.slice(at + 1)}`;
}

/**
 * Demo/mock detection (mock: success). No real key → missing OR a preview stub
 * (`placeholder` / `not_real` / `dummy`). Mirrors the stub vocabulary so a
 * seeded preview value is treated as "not configured", never a real key.
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;

  // Validate first so demo mode behaves exactly like the real path.
  let payload: SubscribePayload;
  try {
    payload = (await request.json()) as SubscribePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  const email = asTrimmedString(payload.email).toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "invalid-email" },
      { status: 422 },
    );
  }

  // Demo/mock mode (mock: success): no real key (missing or an F2 preview
  // stub) → return a believable success with `demo: true` so the form shows a
  // "not really subscribed" notice. Real signup runs only once a genuine key
  // is configured.
  if (!apiKey || isPlaceholderValue(apiKey)) {
    return NextResponse.json({ ok: true, demo: true, status: "subscribed" });
  }

  // Genuine configuration error: a real key is set but the audience id is
  // missing OR still a preview placeholder. Placeholder-aware so a seeded F2
  // stub counts as NOT configured and takes the calm 503 setup path rather than
  // calling Mailchimp with fabricated config (Codex/VADE P1 on #468).
  if (isPlaceholderValue(audienceId)) {
    return NextResponse.json(
      { ok: false, error: "newsletter-not-configured" },
      { status: 503 },
    );
  }

  // A placeholder MAILCHIMP_DC must not become the request host — treat a stub
  // override as absent so the data-center is derived from the real key suffix.
  const dcOverride = isPlaceholderValue(process.env.MAILCHIMP_DC)
    ? undefined
    : process.env.MAILCHIMP_DC;
  const dc = resolveDataCenter(apiKey, dcOverride);
  if (!dc) {
    return NextResponse.json(
      { ok: false, error: "newsletter-misconfigured" },
      { status: 503 },
    );
  }

  const subscriberHash = createHash("md5").update(email).digest("hex");
  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`;
  const auth = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        status_if_new: "pending",
      }),
    });

    const data = (await res.json().catch(() => ({}))) as MailchimpMemberResponse;

    if (res.status === 200 && data.status === "subscribed") {
      return NextResponse.json({ ok: true, status: "already" });
    }
    if (res.status === 200 && (data.status === "pending" || data.status === "transactional")) {
      return NextResponse.json({ ok: true, status: "subscribed" });
    }
    if (res.status >= 200 && res.status < 300) {
      return NextResponse.json({ ok: true, status: "subscribed" });
    }

    console.warn("[newsletter] Mailchimp non-2xx", {
      status: res.status,
      title: data.title,
      detail: data.detail,
      email: redactEmail(email),
    });
    if (res.status === 400 && data.title === "Member Exists") {
      return NextResponse.json({ ok: true, status: "already" });
    }
    return NextResponse.json(
      { ok: false, error: "send-failed" },
      { status: 502 },
    );
  } catch (err) {
    console.error("[newsletter] Unexpected error", { err, email: redactEmail(email) });
    return NextResponse.json(
      { ok: false, error: "send-failed" },
      { status: 502 },
    );
  }
}
