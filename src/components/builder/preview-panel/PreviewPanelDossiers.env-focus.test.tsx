import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelDossiers } from "./PreviewPanelDossiers";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import { catalogResponse, stubFetch, wiredResponse } from "./PreviewPanelDossiers.test-support";

describe("PreviewPanelDossiers env focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("focuses the dossier owning requested env keys and shows masked inputs (412 → Byggblock)", async () => {
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 1, planned: 0 },
        dossiers: [
          {
            id: "stripe-checkout",
            label: "Stripe Checkout",
            class: "hard",
            capability: "payments",
            summary: "Stripe-baserad checkout.",
            complexity: "medium",
            requiresF3: true,
            configured: false,
            dependencies: [],
            envVars: [
              {
                key: "STRIPE_SECRET_KEY",
                required: true,
                enforcement: "build",
                purpose: "Server-side Stripe auth.",
                setupUrl: "https://docs.stripe.com/keys",
                hasRealValue: false,
                placeholderCovered: false,
              },
            ],
            status: "blocked-build",
            missingKeys: ["STRIPE_SECRET_KEY"],
            missingLiveKeys: [],
            lastVerified: "2026-01-01",
          },
        ],
      }),
    });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["STRIPE_SECRET_KEY"]);
    });

    await screen.findByText("Stripe Checkout");
    // The matching row is auto-expanded and offers a masked input for the key.
    await waitFor(() => {
      expect(document.querySelector('input[type="password"]')).not.toBeNull();
    });
    expect(screen.getByLabelText("Värde för STRIPE_SECRET_KEY")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Spara och aktivera/i })).toBeTruthy();
    expect(screen.getByText("Server-side Stripe auth.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Hämta värde/i }).getAttribute("href"),
    ).toBe("https://docs.stripe.com/keys");
  });

  // Regression (owner spec PR 1): saving a key goes straight to the canonical
  // env-vars API — no chat message, no new LLM generation — and the panel
  // refetches so the status can flip demo → live. The typed secret must never
  // be rendered back into the DOM.
  it("applies the focus request against the refetched data when the cached overview misses the dossier", async () => {
    const stripeDossier = {
      id: "stripe-checkout",
      label: "Stripe Checkout",
      class: "hard" as const,
      capability: "payments",
      summary: "Stripe-baserad checkout.",
      complexity: "medium" as const,
      requiresF3: true,
      configured: false,
      dependencies: [],
      envVars: [
        {
          key: "STRIPE_SECRET_KEY",
          required: true,
          enforcement: "build" as const,
          purpose: "Stripe auth.",
          hasRealValue: false,
          placeholderCovered: false,
        },
      ],
      status: "blocked-build" as const,
      missingKeys: ["STRIPE_SECRET_KEY"],
      missingLiveKeys: [],
      lastVerified: "2026-01-01",
    };
    let dossierCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/dossiers/catalog")) {
        return Response.json(catalogResponse());
      }
      if (url.includes("/dossiers")) {
        dossierCalls += 1;
        // First (mount) response is stale/empty; later responses carry the row.
        return Response.json(
          dossierCalls === 1
            ? wiredResponse()
            : wiredResponse({
                counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 1, planned: 0 },
                dossiers: [stripeDossier],
              }),
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);
    await waitFor(() => {
      expect(dossierCalls).toBeGreaterThanOrEqual(1);
    });

    await act(async () => {
      openDossiersPanel(["STRIPE_SECRET_KEY"]);
    });

    // The open-triggered refetch delivers the dossier; the pending focus must
    // still apply — expanded row with the masked input.
    await waitFor(() => {
      expect(document.querySelector('input[type="password"]')).not.toBeNull();
    });
    expect(screen.getByLabelText("Värde för STRIPE_SECRET_KEY")).toBeTruthy();
  });

  // Regression (coach finding #2): a BUILT dossier missing only a
  // feature-runtime key (Stripe/OpenAI-fallet) must light the attention dot.
  it("surfaces an unowned custom env-blocker with a savable input (Egna nycklar)", async () => {
    const savedCalls: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        savedCalls.push({ url, body: JSON.parse(String(init?.body ?? "null")) });
        return Response.json({ success: true });
      }
      if (url.includes("/api/dossiers/catalog")) {
        return Response.json(catalogResponse());
      }
      if (url.includes("/dossiers")) {
        return Response.json(wiredResponse());
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["MY_CUSTOM_SERVICE_KEY"]);
    });

    // No dossier owns the key → it lands in the custom-keys section.
    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(savedCalls.length).toBe(1);
    });
    expect(savedCalls[0].url).toContain("/api/v0/projects/proj_1/env-vars");
    expect(savedCalls[0].body).toEqual({
      vars: [{ key: "MY_CUSTOM_SERVICE_KEY", value: "real-secret-value", sensitive: true }],
      upsert: true,
    });
    // Write-only: the secret never echoes back into the DOM after save.
    await waitFor(() => {
      expect(document.body.innerHTML).not.toContain("real-secret-value");
    });
  });

  // Bugbot on this diff: a deploy blocker can mix dossier-owned and custom
  // keys in ONE focus request — the dossier expand must not swallow the
  // custom key (it still needs its "Egna nycklar"-input).
  it("routes mixed focus keys to both the owning dossier and the custom section", async () => {
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 1, planned: 0 },
        dossiers: [
          {
            id: "stripe-checkout",
            label: "Stripe Checkout",
            class: "hard",
            capability: "payments",
            summary: "Stripe-baserad checkout.",
            complexity: "medium",
            requiresF3: true,
            configured: false,
            dependencies: [],
            envVars: [
              {
                key: "STRIPE_SECRET_KEY",
                required: true,
                enforcement: "build",
                purpose: "Stripe auth.",
                hasRealValue: false,
                placeholderCovered: false,
              },
            ],
            status: "blocked-build",
            missingKeys: ["STRIPE_SECRET_KEY"],
            missingLiveKeys: [],
            lastVerified: "2026-01-01",
          },
        ],
      }),
    });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["STRIPE_SECRET_KEY", "MY_CUSTOM_SERVICE_KEY"]);
    });

    // The owning dossier expands with its input…
    expect(await screen.findByLabelText("Värde för STRIPE_SECRET_KEY")).toBeTruthy();
    // …AND the unowned key gets its custom-section input.
    expect(await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY")).toBeTruthy();
  });

});

