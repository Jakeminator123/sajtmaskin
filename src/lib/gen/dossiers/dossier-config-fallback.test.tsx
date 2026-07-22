/**
 * Runtime-kontraktstester för dossier-fallbacken "graceful integration-
 * fallback" (PR #374): när en integrations env-nycklar saknas ska den
 * genererade sajten degradera till en lugn config-notis + disabled CTA —
 * aldrig rå feltext.
 *
 * Testerna importerar dossier-filerna DIREKT från data/dossiers/ (de är
 * vanlig TSX; klientkomponenterna importerar notisen relativt så ingen
 * alias-mock behövs). Det ger äkta runtime-täckning av:
 *
 *  1. Route-kontraktet: 503 + igenkännbar felkod när env saknas — och att
 *     modul-import av stripe-routen INTE kraschar utan nyckel (lazy init).
 *  2. Klient-kontraktet: explicit felkod → notis + disabled CTA; andra
 *     fel (proxy-503 utan kod, 500/502) → vanlig retry-bar felväg.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// clerk-auth's components import `@clerk/nextjs` at module top — a dependency
// of the GENERATED site, not of this repo. `vitest.config.ts` aliases it to
// the inert stub in `tests/stubs/clerk-nextjs.tsx`; the demo-mode branch under
// test never mounts the Clerk components.
import { AuthButtons } from "../../../../data/dossiers/hard/clerk-auth/components/auth-buttons";
import { CheckoutButton } from "../../../../data/dossiers/hard/stripe-checkout/components/checkout-button";
import { ContactForm } from "../../../../data/dossiers/hard/resend-contact-form/components/contact-form";
import { IntegrationConfigNotice } from "../../../../data/dossiers/hard/stripe-checkout/components/integration-config-notice";
import {
  isPlaceholderValue as sanityIsPlaceholderValue,
  isSanityConfigured,
} from "../../../../data/dossiers/hard/sanity-cms/components/lib/sanity/api";
import { seedContent } from "../../../../data/dossiers/hard/sanity-cms/components/lib/sanity/seed-content";
import { SanityConfigNotice } from "../../../../data/dossiers/hard/sanity-cms/components/sanity-config-notice";

function mockFetchOnce(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IntegrationConfigNotice", () => {
  it("renders title, message, env key names and a setup link (never values)", () => {
    render(
      <IntegrationConfigNotice
        title="Betalningar är inte aktiverade ännu"
        message="Koppla sajten till Stripe."
        envKeys={["STRIPE_SECRET_KEY"]}
        docHref="https://dashboard.stripe.com/apikeys"
        docLabel="Så hittar du din Stripe-nyckel"
      />,
    );
    expect(screen.getByText("Betalningar är inte aktiverade ännu")).toBeTruthy();
    expect(screen.getByText("STRIPE_SECRET_KEY")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Så hittar du din Stripe-nyckel" });
    expect(link.getAttribute("href")).toBe("https://dashboard.stripe.com/apikeys");
    // Calm/neutral tone contract: the notice must not use destructive styling.
    expect(screen.getByRole("note").className).not.toContain("destructive");
  });
});

describe("CheckoutButton — demo-mode fallback (stripe-checkout, mock: visual)", () => {
  it("keeps the button ENABLED and opens the demo modal on 503 payments-not-configured", async () => {
    mockFetchOnce(503, { error: "payments-not-configured" });
    render(<CheckoutButton priceId="price_123" label="Köp nu" />);

    fireEvent.click(screen.getByRole("button", { name: "Köp nu" }));

    // Demo mode (mock: visual): the click opens an honest demo dialog instead
    // of disabling the CTA — the full checkout surface stays interactive.
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("checkout-demo-title");
    expect(screen.getByText("Demoläge — ingen riktig betalning")).toBeTruthy();
    // The IntegrationConfigNotice inside the modal names the env key needed
    // to switch demo mode off (never its value).
    expect(screen.getByText("STRIPE_SECRET_KEY")).toBeTruthy();

    // No disabled state anymore: the CTA must stay clickable after the modal.
    const button = screen.getByRole("button", { name: "Köp nu" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    // Never leak a raw status code to the visitor.
    expect(screen.queryByText(/503/)).toBeNull();

    // "Stäng" closes the demo dialog again.
    fireEvent.click(screen.getByRole("button", { name: "Stäng" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("takes the retryable error path on a 503 WITHOUT the explicit code (proxy 503)", async () => {
    mockFetchOnce(503, undefined);
    render(<CheckoutButton priceId="price_123" label="Köp nu" />);

    fireEvent.click(screen.getByRole("button", { name: "Köp nu" }));

    await waitFor(() => {
      expect(
        screen.getByText("Det gick inte att starta betalningen. Försök igen om en stund."),
      ).toBeTruthy();
    });
    // NOT the config notice — Stripe may be perfectly configured here.
    expect(screen.queryByText("Betalningar är inte aktiverade ännu")).toBeNull();
    // Button stays retryable (enabled) after the error.
    const button = screen.getByRole("button", { name: "Köp nu" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("takes the retryable error path on 500 with a different error body", async () => {
    mockFetchOnce(500, { error: "Some internal Stripe error" });
    render(<CheckoutButton priceId="price_123" />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(
        screen.getByText("Det gick inte att starta betalningen. Försök igen om en stund."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Betalningar är inte aktiverade ännu")).toBeNull();
    // The raw upstream error message must not reach the visitor.
    expect(screen.queryByText(/Some internal Stripe error/)).toBeNull();
  });
});

describe("AuthButtons — demo-mode fallback (clerk-auth, mock: visual)", () => {
  const KEY = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY";
  const savedKey = process.env[KEY];

  afterEach(() => {
    if (savedKey === undefined) delete process.env[KEY];
    else process.env[KEY] = savedKey;
  });

  it("renders plain buttons without a valid key and opens the demo dialog on 'Logga in'", async () => {
    // Placeholder value = not configured (same check as ClerkProviderShell).
    process.env[KEY] = "pk_test_placeholder";
    render(<AuthButtons />);

    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("auth-demo-title");
    expect(screen.getByText("Inloggning i demoläge")).toBeTruthy();
    // The dialog names the env keys needed for real accounts (never values).
    expect(screen.getByText("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")).toBeTruthy();
    expect(screen.getByText("CLERK_SECRET_KEY")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stäng" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("ContactForm — not-configured fallback (resend-contact-form)", () => {
  function fillAndSubmit() {
    fireEvent.change(screen.getByLabelText("Namn"), { target: { value: "Anna" } });
    fireEvent.change(screen.getByLabelText("E-post"), {
      target: { value: "anna@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Meddelande"), {
      target: { value: "Hej! Jag vill boka." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skicka meddelande" }));
  }

  it("renders the config notice + disabled submit on 503 email-not-configured", async () => {
    mockFetchOnce(503, { ok: false, error: "email-not-configured" });
    render(<ContactForm />);

    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText("Kontaktformuläret är inte aktiverat ännu")).toBeTruthy();
    });
    expect(screen.getByText("RESEND_API_KEY")).toBeTruthy();
    const submit = screen.getByRole("button", {
      name: "Skicka meddelande",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.queryByText(/503/)).toBeNull();
    // Form contents must be preserved (never throw away what the user typed).
    expect((screen.getByLabelText("Meddelande") as HTMLTextAreaElement).value).toBe(
      "Hej! Jag vill boka.",
    );
  });

  it("shows a thank-you + demo notice on a 200 demo success (mock: success)", async () => {
    mockFetchOnce(200, { ok: true, demo: true });
    render(<ContactForm />);

    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText("Tack — ditt meddelande är på väg.")).toBeTruthy();
    });
    // Honest demo disclosure: the message was not actually delivered.
    expect(
      screen.getByText(/Demo: meddelandet skickades inte på riktigt/),
    ).toBeTruthy();
  });

  it("does NOT show the demo notice on a real (non-demo) 200 success", async () => {
    mockFetchOnce(200, { ok: true });
    render(<ContactForm />);

    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText("Tack — ditt meddelande är på väg.")).toBeTruthy();
    });
    expect(screen.queryByText(/Demo: meddelandet skickades inte/)).toBeNull();
  });

  it("takes the retryable error path on 502 send-failed (NOT the config notice)", async () => {
    mockFetchOnce(502, { ok: false, error: "send-failed" });
    render(<ContactForm />);

    fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText("Meddelandet kunde inte skickas just nu. Försök igen om en stund."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Kontaktformuläret är inte aktiverat ännu")).toBeNull();
    const submit = screen.getByRole("button", {
      name: "Skicka meddelande",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("takes the retryable error path on a 503 WITHOUT the explicit code (proxy 503)", async () => {
    mockFetchOnce(503, undefined);
    render(<ContactForm />);

    fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText("Meddelandet kunde inte skickas just nu. Försök igen om en stund."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Kontaktformuläret är inte aktiverat ännu")).toBeNull();
  });
});

describe("dossier API routes — recognizable not-configured error codes", () => {
  const ENV_KEYS = [
    "STRIPE_SECRET_KEY",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "CONTACT_EMAIL_TO",
    "OPENAI_API_KEY",
    "MAILCHIMP_API_KEY",
    "MAILCHIMP_AUDIENCE_ID",
  ] as const;
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("stripe route: module import does not crash without STRIPE_SECRET_KEY and POST returns 503 payments-not-configured", async () => {
    // Regression guard for the Codex P1: a module-level `new Stripe("")`
    // throws at import time and makes this 503 path unreachable. Importing
    // AFTER deleting the env key proves the client is constructed lazily.
    const { POST } = await import(
      "../../../../data/dossiers/hard/stripe-checkout/components/api/checkout-session/route"
    );
    const res = await POST(
      new Request("http://localhost/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: "price_123" }),
      }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "payments-not-configured" });
  });

  it("stripe route: F2 stub placeholder key is treated as NOT configured (503, not a Stripe 500)", async () => {
    // Codex P2: previews inject sk_test_placeholder_preview_not_real from
    // config/ai_models/41-tier3-stub-placeholders.env.txt — calling Stripe
    // with it yields a generic 500 and the config notice is skipped.
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder_preview_not_real";
    const { POST } = await import(
      "../../../../data/dossiers/hard/stripe-checkout/components/api/checkout-session/route"
    );
    const res = await POST(
      new Request("http://localhost/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: "price_123" }),
      }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "payments-not-configured" });
  });

  // Våg 2 (mock: success): a stub RESEND_API_KEY is no longer a hard 503 —
  // the route now returns a demo success so the form flow works in F2/preview.
  // The 503 email-not-configured path is retained only for a REAL key with
  // missing addresses (see the next test).
  it("resend route: stub placeholder key returns a demo success (mock: success)", async () => {
    process.env.RESEND_API_KEY = "re_placeholder_preview_not_a_real_key";
    process.env.EMAIL_FROM = "noreply@example.com";
    process.env.CONTACT_EMAIL_TO = "owner@example.com";
    const { POST } = await import(
      "../../../../data/dossiers/hard/resend-contact-form/components/api/contact/route"
    );
    const res = await POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Anna",
          email: "anna@example.com",
          message: "Hej!",
        }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, demo: true });
  });

  it("resend route: real key but missing addresses keeps the 503 email-not-configured path", async () => {
    process.env.RESEND_API_KEY = "re_areallylongrealkey0000000000000000";
    delete process.env.EMAIL_FROM;
    delete process.env.CONTACT_EMAIL_TO;
    const { POST } = await import(
      "../../../../data/dossiers/hard/resend-contact-form/components/api/contact/route"
    );
    const res = await POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Anna",
          email: "anna@example.com",
          message: "Hej!",
        }),
      }) as never,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "email-not-configured" });
  });

  it("resend route: real key + PLACEHOLDER addresses take the 503 path, never a real send (Codex/VADE P1 #468)", async () => {
    // The F2 mock-seed fills EMAIL_FROM/CONTACT_EMAIL_TO with stub values. With
    // a real key the demo branch is skipped, so a mere-presence check would call
    // Resend with fabricated addresses. Placeholder-aware secondary check keeps
    // the calm setup 503 instead.
    process.env.RESEND_API_KEY = "re_areallylongrealkey0000000000000000";
    process.env.EMAIL_FROM = "email_from_placeholder_preview_not_real";
    process.env.CONTACT_EMAIL_TO = "contact_email_to_placeholder_preview_not_real";
    const { POST } = await import(
      "../../../../data/dossiers/hard/resend-contact-form/components/api/contact/route"
    );
    const res = await POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Anna", email: "anna@example.com", message: "Hej!" }),
      }) as never,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "email-not-configured" });
  });

  it("stripe route: with a key set, body validation still runs before any Stripe call", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_validation_only";
    const { POST } = await import(
      "../../../../data/dossiers/hard/stripe-checkout/components/api/checkout-session/route"
    );
    const res = await POST(
      new Request("http://localhost/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "priceId is required" });
  });

  it("resend route: missing keys return a demo success (mock: success)", async () => {
    const { POST } = await import(
      "../../../../data/dossiers/hard/resend-contact-form/components/api/contact/route"
    );
    const request = new Request("http://localhost/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Anna",
        email: "anna@example.com",
        message: "Hej!",
      }),
    });
    // The route types its param as NextRequest but only uses .json();
    // a plain Request satisfies that surface.
    const res = await POST(request as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, demo: true });
  });

  it("resend route: still validates the body before the demo branch", async () => {
    const { POST } = await import(
      "../../../../data/dossiers/hard/resend-contact-form/components/api/contact/route"
    );
    const res = await POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", email: "nope", message: "" }),
      }) as never,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "missing-required-fields" });
  });

  it("mailchimp route: missing key returns a demo success (mock: success)", async () => {
    delete process.env.MAILCHIMP_API_KEY;
    delete process.env.MAILCHIMP_AUDIENCE_ID;
    const { POST } = await import(
      "../../../../data/dossiers/hard/mailchimp-newsletter/components/api/newsletter-subscribe/route"
    );
    const res = await POST(
      new Request("http://localhost/api/newsletter-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "anna@example.com" }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, demo: true, status: "subscribed" });
  });

  it("mailchimp route: real key + PLACEHOLDER audience id takes the 503 path, no provider call (Codex/VADE P1 #468)", async () => {
    // Real key + F2-seeded stub audience id → a mere-presence check would fetch
    // Mailchimp with a fabricated audience/host. Placeholder-aware check keeps
    // the calm setup 503 — returned BEFORE the fetch line, so reaching 503
    // proves no provider call was made.
    // Non-placeholder but deliberately NOT shaped like a real Mailchimp key
    // (no 32-hex prefix) so secret-scanning push protection does not flag it.
    process.env.MAILCHIMP_API_KEY = "realmailchimpkey-us21";
    process.env.MAILCHIMP_AUDIENCE_ID = "mailchimp_audience_id_placeholder_preview_not_real";
    const { POST } = await import(
      "../../../../data/dossiers/hard/mailchimp-newsletter/components/api/newsletter-subscribe/route"
    );
    const res = await POST(
      new Request("http://localhost/api/newsletter-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "anna@example.com" }),
      }) as never,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "newsletter-not-configured" });
  });

  it("openai-chat route: missing key streams a canned demo reply (mock: canned)", async () => {
    delete process.env.OPENAI_API_KEY;
    const { POST } = await import(
      "../../../../data/dossiers/hard/openai-chat/components/api/chat/route"
    );
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(200);
    // The canned reply streams over the AI SDK UI-message-stream (SSE) — the
    // demo copy tokens appear in the serialized body.
    const text = await res.text();
    expect(text).toContain("demo-assistent");
  });
  // NOTE: the fal-image-generation and DB (neon/mongodb) routes are not
  // import-tested here because their SDKs (`@ai-sdk/fal`, `@neondatabase/
  // serverless`, `mongodb`) are dossier-only dependencies, not installed in
  // the Sajtmaskin app, so a direct `import` would fail to resolve. Their mock
  // behavior is covered by the manifest `mock` field + validator + docs. The
  // sanity-cms client/fetch/draft-mode routes are likewise not import-tested
  // (`next-sanity` is dossier-only + they are `server-only`-guarded); the
  // dossier's mock contract is covered by the env-gate tests below.
});

// ─────────────────────────────────────────────────────────────────────────
// sanity-cms (mock: seed, Fas D 2026-07-09): the placeholder-aware config
// gate + the seed-fallback surface. The gate is what every Sanity-backed
// page branches on — if it misreads an F2 stub as "configured", pages query
// a nonexistent project instead of rendering seedContent.
// ─────────────────────────────────────────────────────────────────────────
describe("sanity-cms — seed fallback contract (mock: seed)", () => {
  const SANITY_KEYS = [
    "NEXT_PUBLIC_SANITY_PROJECT_ID",
    "NEXT_PUBLIC_SANITY_DATASET",
  ] as const;
  const savedSanity = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of SANITY_KEYS) {
      savedSanity.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of SANITY_KEYS) {
      const value = savedSanity.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("isSanityConfigured() is false with missing env (seed-fallback path)", () => {
    expect(isSanityConfigured()).toBe(false);
  });

  it("isSanityConfigured() is false for F2 preview stubs (placeholder-aware, not mere presence)", () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID =
      "next_public_sanity_project_id_placeholder_preview_not_real";
    process.env.NEXT_PUBLIC_SANITY_DATASET =
      "next_public_sanity_dataset_placeholder_preview_not_real";
    expect(isSanityConfigured()).toBe(false);
  });

  it("isSanityConfigured() is true only when BOTH values are real", () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "abc12345";
    expect(isSanityConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_SANITY_DATASET = "production";
    expect(isSanityConfigured()).toBe(true);
  });

  it("isPlaceholderValue matches the stub vocabulary and accepts real values", () => {
    expect(sanityIsPlaceholderValue(undefined)).toBe(true);
    expect(sanityIsPlaceholderValue("   ")).toBe(true);
    expect(sanityIsPlaceholderValue("sanity_api_read_token_placeholder_preview_not_real")).toBe(true);
    expect(sanityIsPlaceholderValue("your_project_id")).toBe(true);
    expect(sanityIsPlaceholderValue("abc12345")).toBe(false);
    expect(sanityIsPlaceholderValue("production")).toBe(false);
  });

  it("ships non-empty seedContent + renders the discreet SanityConfigNotice", () => {
    expect(seedContent.length).toBeGreaterThan(0);
    for (const doc of seedContent) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.slug.length).toBeGreaterThan(0);
    }
    render(<SanityConfigNotice />);
    expect(screen.getByText(/CMS ej konfigurerat/i)).toBeTruthy();
  });
});
