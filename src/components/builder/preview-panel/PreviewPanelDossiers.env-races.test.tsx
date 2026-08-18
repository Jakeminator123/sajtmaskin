import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelDossiers } from "./PreviewPanelDossiers";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import { catalogResponse, wiredResponse } from "./PreviewPanelDossiers.test-support";

describe("PreviewPanelDossiers env races", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not resurrect the dossier-row save receipt if the version changes before the save's POST resolves", async () => {
    const demoDossier = {
      id: "openai-chat",
      label: "OpenAI Chat",
      class: "hard" as const,
      capability: "ai-chat",
      summary: "Chatbot via OpenAI.",
      complexity: "medium" as const,
      requiresF3: true,
      configured: false,
      dependencies: [],
      envVars: [
        {
          key: "OPENAI_API_KEY",
          required: true,
          enforcement: "feature-runtime" as const,
          purpose: "OpenAI auth.",
          hasRealValue: false,
          placeholderCovered: true,
        },
      ],
      status: "built-demo" as const,
      missingKeys: [],
      missingLiveKeys: ["OPENAI_API_KEY"],
      lastVerified: "2026-01-01",
    };
    let resolveSave: ((value: Response) => void) | null = null;
    const savePromise = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) return savePromise;
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) {
        return Response.json(
          wiredResponse({
            counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
            dossiers: [demoDossier],
          }),
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-my-secret-key" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara nyckel/i }));

    // Switch version WHILE the save's own POST is still unresolved.
    await act(async () => {
      rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);
    });

    // The save's POST finally resolves, late, after the switch above. Flush
    // several macrotask ticks so the dispatch-triggered refetch chain
    // (fetch resolve -> response.json() -> setData commit -> resolving
    // effect) has every chance to run before we assert.
    await act(async () => {
      resolveSave?.(Response.json({ success: true }));
      for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    // The version switch above also collapses the row (separate, pre-existing
    // reset), which alone would hide the receipt regardless of whether the
    // state bug this test targets is fixed. Re-expand it to check the actual
    // state, not the collapse: if `pendingSaveConfirmationRef` wrongly got
    // re-armed by the late completion, the receipt reappears right here.
    fireEvent.click(screen.getByRole("button", { name: /OpenAI Chat/i }));
    expect(screen.queryByText(/Previewn startas om/)).toBeNull();
  });

  it("does not resurrect the custom-key save confirmation if the version changes before the save's POST resolves", async () => {
    let resolveSave: ((value: Response) => void) | null = null;
    const savePromise = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) return savePromise;
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) return Response.json(wiredResponse());
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["MY_CUSTOM_SERVICE_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara nyckel/i }));

    // Switch version WHILE the save's own POST is still unresolved.
    await act(async () => {
      rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);
    });

    // The save's POST finally resolves, late, after the switch above. Flush
    // several macrotask ticks so the dispatch-triggered refetch chain has
    // every chance to run before we assert.
    await act(async () => {
      resolveSave?.(Response.json({ success: true }));
      for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    expect(screen.queryByText(/Sparat\. Previewn startas om med de nya värdena\./)).toBeNull();
  });

  // Bugbot follow-up (4th pass on this diff): saveError/customError describe
  // ONE save attempt just as much as the success receipts above, but were
  // only ever reset on a full chat change -- a plain version switch (same
  // chat) left a failed-on-the-old-version message able to resurface.
  it("clears the dossier-row save error when only the version changes (not just the chat)", async () => {
    const demoDossier = {
      id: "openai-chat",
      label: "OpenAI Chat",
      class: "hard" as const,
      capability: "ai-chat",
      summary: "Chatbot via OpenAI.",
      complexity: "medium" as const,
      requiresF3: true,
      configured: false,
      dependencies: [],
      envVars: [
        {
          key: "OPENAI_API_KEY",
          required: true,
          enforcement: "feature-runtime" as const,
          purpose: "OpenAI auth.",
          hasRealValue: false,
          placeholderCovered: true,
        },
      ],
      status: "built-demo" as const,
      missingKeys: [],
      missingLiveKeys: ["OPENAI_API_KEY"],
      lastVerified: "2026-01-01",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        return Response.json({ success: false, error: "Ogiltig nyckel." }, { status: 400 });
      }
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) {
        return Response.json(
          wiredResponse({
            counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
            dossiers: [demoDossier],
          }),
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-my-secret-key" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara nyckel/i }));

    await waitFor(() => {
      expect(screen.getByText("Ogiltig nyckel.")).toBeTruthy();
    });

    // Same chat, new version: the error must not survive.
    rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);

    await waitFor(() => {
      expect(screen.queryByText("Ogiltig nyckel.")).toBeNull();
    });

    // The version switch also collapses the row (a separate, pre-existing
    // reset), which alone would hide the error regardless of whether
    // `saveError` itself got cleared. Re-expand it to check the actual
    // state, not the collapse.
    fireEvent.click(screen.getByRole("button", { name: /OpenAI Chat/i }));
    expect(screen.queryByText("Ogiltig nyckel.")).toBeNull();
  });

  it("clears the custom-key save error when only the version changes (not just the chat)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        return Response.json({ success: false, error: "Ogiltig nyckel." }, { status: 400 });
      }
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) return Response.json(wiredResponse());
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["MY_CUSTOM_SERVICE_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara nyckel/i }));

    await waitFor(() => {
      expect(screen.getByText("Ogiltig nyckel.")).toBeTruthy();
    });

    // Same chat, new version: the error must not survive (not gated by row
    // expansion -- "Egna nycklar" is a fixed section, not a dossier row).
    rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);

    await waitFor(() => {
      expect(screen.queryByText("Ogiltig nyckel.")).toBeNull();
    });
  });

  // Lucka 3 (ägarbeslut 2026-08-11): `builder-shell-content/` weaves these
  // counts into the F3-trigger's success title — this is the ONLY fetch of
  // `/dossiers`'s counts; `PreviewPanelF3Trigger` must never fetch it again.
});

