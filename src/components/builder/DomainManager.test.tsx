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

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("ignores a stale out-of-order search result/error from an earlier search", async () => {
    // First /api/domains/check is deferred and will later fail; the second
    // search resolves immediately with results. The stale first response
    // must not overwrite the newer results nor flash an error banner.
    let resolveStaleSearch: ((res: Response) => void) | null = null;
    const staleSearch = new Promise<Response>((resolve) => {
      resolveStaleSearch = resolve;
    });
    let checkCalls = 0;

    mockFetch((url) => {
      if (url.includes("/api/domains/check")) {
        checkCalls += 1;
        return checkCalls === 1
          ? staleSearch
          : json({ results: [AVAILABLE_RESULT] }, 200);
      }
      return json({}, 200);
    });

    render(<DomainManager open onClose={() => {}} projectId="proj_1" />);

    const input = screen.getByPlaceholderText(/mittforetag\.se/i);
    fireEvent.change(input, { target: { value: "mittforetag.se" } });

    // Fire two searches before React can flush the disabled state (mirrors a
    // real double-click): #1 is the slow/stale one, #2 resolves fast.
    const searchBtn = screen.getByRole("button", { name: /Sök/i });
    await act(async () => {
      searchBtn.click();
      searchBtn.click();
      await Promise.resolve();
    });

    // Search #2 resolves with results.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Koppla" })).toBeTruthy();
    });

    // Now the stale search #1 fails — the guard must drop it.
    await act(async () => {
      resolveStaleSearch?.(
        new Response(JSON.stringify({ error: "stale" }), { status: 500 }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText(/^stale$/i)).toBeNull();
    expect(screen.queryByText(/Sökning misslyckades/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Koppla" })).toBeTruthy();
  });

  it("resets the search spinner when the dialog closes mid-search", async () => {
    // The first /api/domains/check is deferred (still in flight when the
    // dialog closes). A stuck isSearching would leave the reopened Sök button
    // disabled forever, because handleSearch's finally only clears it when the
    // captured generation still matches.
    let resolveSearch: ((res: Response) => void) | null = null;
    const pending = new Promise<Response>((resolve) => {
      resolveSearch = resolve;
    });

    mockFetch((url) => {
      if (url.includes("/api/domains/check")) {
        return pending;
      }
      return json({}, 200);
    });

    const { rerender } = render(
      <DomainManager open onClose={() => {}} projectId="proj_1" />,
    );

    fireEvent.change(screen.getByPlaceholderText(/mittforetag\.se/i), {
      target: { value: "mittforetag.se" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sök/i }));

    // Search is in flight → Sök is disabled.
    await waitFor(() => {
      expect((screen.getByRole("button", { name: /Sök/i }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    // Close while the search is still pending, then reopen fresh.
    rerender(<DomainManager open={false} onClose={() => {}} projectId="proj_1" />);
    rerender(<DomainManager open onClose={() => {}} projectId="proj_1" />);

    // Type a fresh query; the button must be enabled again (isSearching reset).
    fireEvent.change(screen.getByPlaceholderText(/mittforetag\.se/i), {
      target: { value: "annat.se" },
    });
    expect((screen.getByRole("button", { name: /Sök/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    // Resolve the stale search so it does not leak; the guard drops it.
    await act(async () => {
      resolveSearch?.(json({ results: [AVAILABLE_RESULT] }, 200));
      await Promise.resolve();
    });
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

  it("does not warn from a stale background save after the dialog is reset", async () => {
    // First /api/domains/save is deferred (simulates a slow save from an
    // earlier link); later saves succeed immediately.
    let resolveStaleSave: ((res: Response) => void) | null = null;
    const staleSave = new Promise<Response>((resolve) => {
      resolveStaleSave = resolve;
    });
    let saveCalls = 0;

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
        saveCalls += 1;
        return saveCalls === 1 ? staleSave : json({ success: true }, 200);
      }
      if (url.includes("/api/domains/verify")) {
        return json({ verified: false, verification: [] }, 200);
      }
      return json({}, 200);
    });

    const linkToVerify = async () => {
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
      fireEvent.click(
        screen.getByRole("button", { name: /Koppla mittforetag\.se/i }),
      );
      await waitFor(() => {
        expect(screen.getByText(/Väntar på DNS-propagering/i)).toBeTruthy();
      });
    };

    const { rerender } = render(
      <DomainManager open onClose={() => {}} projectId="proj_1" deploymentId="dep_1" />,
    );

    // Session 1: link → verify, save #1 is still pending.
    await linkToVerify();

    // Close (resets + bumps the save generation), then reopen fresh.
    rerender(
      <DomainManager open={false} onClose={() => {}} projectId="proj_1" deploymentId="dep_1" />,
    );
    rerender(
      <DomainManager open onClose={() => {}} projectId="proj_1" deploymentId="dep_1" />,
    );

    // Session 2: a new link whose save succeeds.
    await linkToVerify();

    // Now the stale save #1 resolves with a failure — the guard must drop it.
    await act(async () => {
      resolveStaleSave?.(new Response(JSON.stringify({}), { status: 500 }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText(/kunde inte sparas på publiceringen/i)).toBeNull();
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
