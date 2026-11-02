import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWizardEnrichment } from "./use-wizard-enrichment";

describe("wizard website input", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ success: true, data: { textSummary: "Website copy" } })),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  function renderWizard() {
    return renderHook(() =>
      useWizardEnrichment({
        isOpen: false,
        isAuthenticated: true,
        isInitialized: true,
        wizardRunId: "test-run",
        step: 1,
        companyName: "Workershotel",
        industry: "Hotel",
        location: "",
        existingWebsite: "",
        inspirationSites: [],
        purposes: [],
        targetAudience: "",
        usp: "",
        selectedVibe: "",
        specialWishes: "",
        companyLookup: null,
        competitors: [],
        setWebsiteAnalysis: vi.fn(),
      }),
    );
  }

  it.each([
    ["Workershotel.se", "https://workershotel.se/"],
    [" workershotel.se ", "https://workershotel.se/"],
    ["www.workershotel.se", "https://www.workershotel.se/"],
    [" HTTPS://Workershotel.se/Rooms?ref=partner ", "https://workershotel.se/Rooms?ref=partner"],
  ])("sends the same normalized URL to all three phases: %s", async (input, expected) => {
    const { result } = renderWizard();
    act(() => result.current.handleScrapeWebsite(input));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    for (const endpoint of ["/api/wizard/quick-scrape", "/api/analyze-website", "/api/wizard/enrich"]) {
      const call = fetchMock.mock.calls.find(([url]) => url === endpoint);
      expect(call).toBeDefined();
      const body = JSON.parse(call![1].body);
      expect(endpoint.endsWith("enrich") ? body.scrapeUrl : body.url).toBe(expected);
    }
    await waitFor(() => expect(result.current.isScraping).toBe(false));
  });

  it.each(["   ", "not a url", "file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "https://user:secret@example.com"])(
    "does not spend scrape or analysis requests for invalid input: %s",
    (input) => {
      const { result } = renderWizard();
      act(() => result.current.handleScrapeWebsite(input));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.isScraping).toBe(false);
    },
  );
});
