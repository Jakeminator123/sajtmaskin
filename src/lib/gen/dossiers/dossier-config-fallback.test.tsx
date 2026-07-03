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

import { CheckoutButton } from "../../../../data/dossiers/hard/stripe-checkout/components/checkout-button";
import { ContactForm } from "../../../../data/dossiers/hard/resend-contact-form/components/contact-form";
import { IntegrationConfigNotice } from "../../../../data/dossiers/hard/stripe-checkout/components/integration-config-notice";

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

describe("CheckoutButton — not-configured fallback (stripe-checkout)", () => {
  it("renders the config notice + disabled button on 503 payments-not-configured", async () => {
    mockFetchOnce(503, { error: "payments-not-configured" });
    render(<CheckoutButton priceId="price_123" label="Köp nu" />);

    fireEvent.click(screen.getByRole("button", { name: "Köp nu" }));

    await waitFor(() => {
      expect(screen.getByText("Betalningar är inte aktiverade ännu")).toBeTruthy();
    });
    expect(screen.getByText("STRIPE_SECRET_KEY")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Köp nu" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // Never leak a raw status code to the visitor.
    expect(screen.queryByText(/503/)).toBeNull();
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

  it("resend route: POST returns 503 email-not-configured when env keys are missing", async () => {
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
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "email-not-configured" });
  });
});
