/**
 * UI-tests for DomainManager error/status surfacing (G#75 / U#11 / U#12).
 *
 * Covers the regression that search- and save-failures were hidden:
 * - Search error → visible error banner (NOT "Inga resultat hittades").
 * - Empty results → "Inga resultat hittades" (unchanged happy path).
 * - Link success + save failure → non-blocking saveWarning banner in the
 *   verify step, while the verify flow still renders.
 * - Link failure → existing linkError banner, stays on the connect step.
 *
 * fetch is mocked per-endpoint via a URL switch (mirrors SeoOptInPanel.test).
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainManager } from "./DomainManager";

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function mockFetch(handler: FetchHandler) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as unknown as typeof fetch;
}

const AVAILABLE_RESULT = {
  domain: "mittforetag.se",
  available: true,
  price: 99,
  currency: "SEK",
  provider: "loopia" as const,
  purchaseUrl: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DomainManager error/status surfacing", () => {
  beforeEach(() => {
    // Clipboard is touched by copy buttons in some steps.
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
  });

  it("shows a search error banner instead of 'Inga resultat hittades'", async () => {
    mockFetch((url) => {
      if (url.includes("/api/domains/check")) {
        return json({ error: "Sökmotorn svarade inte" }, 500);
      }
      return json({}, 200);
    });

    render(<DomainManager open onClose={() => {}} projectId="proj_1" />);

    fireEvent.change(screen.getByPlaceholderText(/mittforetag\.se/i), {
      target: { value: "mittforetag.se" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sök/i }));

    await waitFor(() => {
      expect(screen.getByText(/Sökmotorn svarade inte/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Inga resultat hittades/i)).toBeNull();
  });

  it("shows 'Inga resultat hittades' when the search returns empty", async () => {
    mockFetch((url) => {
      if (url.includes("/api/domains/check")) {
        return json({ results: [] }, 200);
      }
      return json({}, 200);
    });

    render(<DomainManager open onClose={() => {}} projectId="proj_1" />);

    fireEvent.change(screen.getByPlaceholderText(/mittforetag\.se/i), {
      target: { value: "mittforetag.se" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sök/i }));

    await waitFor(() => {
      expect(screen.getByText(/Inga resultat hittades/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Inga resultat hittades/i)).toBeTruthy();
  });

  it("surfaces a non-blocking save warning when /api/domains/save fails after link", async () => {
    mockFetch((url) => {
      if (url.includes("/api/domains/check")) {
        return json({ results: [AVAILABLE_RESULT] }, 200);
      }
      if (url.includes("/api/domains/link")) {
        return json(
          {
            success: true,
            domain: AVAILABLE_RESULT.domain,
            verified: false,
            dnsSetup: null,
            dnsInstructions: null,
          },
          200,
        );
      }
      if (url.includes("/api/domains/save")) {
        // Bodyless 500 → exercises the default save-warning copy.
        return json({}, 500);
      }
      if (url.includes("/api/domains/verify")) {
        return json({ verified: false, verification: [] }, 200);
      }
      return json({}, 200);
    });

    render(
      <DomainManager
        open
        onClose={() => {}}
        projectId="proj_1"
        deploymentId="dep_1"
      />,
    );

    // Search → results
    fireEvent.change(screen.getByPlaceholderText(/mittforetag\.se/i), {
      target: { value: "mittforetag.se" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sök/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Koppla" })).toBeTruthy();
    });

    // Select → connect step
    fireEvent.click(screen.getByRole("button", { name: "Koppla" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Koppla mittforetag\.se/i }),
      ).toBeTruthy();
    });

    // Link → verify step + save failure surfaced
    fireEvent.click(screen.getByRole("button", { name: /Koppla mittforetag\.se/i }));

    await waitFor(() => {
      expect(screen.getByText(/kunde inte sparas på publiceringen/i)).toBeTruthy();
    });
    // Verify step still rendered (non-blocking).
    expect(screen.getByText(/Väntar på DNS-propagering/i)).toBeTruthy();
  });

  it("shows linkError and stays on connect step when link fails", async () => {
    mockFetch((url) => {
      if (url.includes("/api/domains/check")) {
        return json({ results: [AVAILABLE_RESULT] }, 200);
      }
      if (url.includes("/api/domains/link")) {
        return json({ error: "Kunde inte koppla domän just nu" }, 400);
      }
      return json({}, 200);
    });

    render(<DomainManager open onClose={() => {}} projectId="proj_1" />);

    fireEvent.change(screen.getByPlaceholderText(/mittforetag\.se/i), {
      target: { value: "mittforetag.se" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sök/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Koppla" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Koppla" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Koppla mittforetag\.se/i }),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Koppla mittforetag\.se/i }));

    await waitFor(() => {
      expect(screen.getByText(/Kunde inte koppla domän just nu/i)).toBeTruthy();
    });
    // Still on connect step: the link button is present, verify status is not.
    expect(screen.queryByText(/Väntar på DNS-propagering/i)).toBeNull();
  });
});
