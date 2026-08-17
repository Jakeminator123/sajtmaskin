import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelDossiers } from "./PreviewPanelDossiers";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import { catalogResponse, wiredResponse } from "./PreviewPanelDossiers.test-support";

describe("PreviewPanelDossiers env feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("lucka 1: shows an inline receipt with the new status after a successful save (replaces the removed toast)", async () => {
    let saved = false;
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
    const liveDossier = {
      ...demoDossier,
      configured: true,
      envVars: [{ ...demoDossier.envVars[0], hasRealValue: true, placeholderCovered: false }],
      status: "built-live" as const,
      missingLiveKeys: [],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        saved = true;
        return Response.json({ success: true });
      }
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) {
        return Response.json(
          wiredResponse({
            counts: saved
              ? { total: 1, hard: 1, soft: 0, builtLive: 1, builtDemo: 0, blockedBuild: 0, planned: 0 }
              : { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
            dossiers: [saved ? liveDossier : demoDossier],
          }),
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-my-secret-key" } });
    // No confirmation before the save.
    expect(screen.queryByText(/Previewn startas om/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Spara nyckel/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Nyckeln sparad. Previewn startas om. Blocket blir live när integrationen är byggd; är den redan byggd räcker en riktig nyckel.",
        ),
      ).toBeTruthy();
    });
  });

  // Bugbot on this diff (lucka 1 follow-up): the receipt quotes ONE version's
  // dossier status. Switching version — even within the same chat, where
  // secret drafts intentionally survive (see the chat-switch test above) —
  // must drop a shown/pending receipt instead of leaving a stale claim about
  // the OLD version under the new one.
  it("clears the save receipt when only the version changes (not just the chat)", async () => {
    let saved = false;
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
    const liveDossier = {
      ...demoDossier,
      configured: true,
      envVars: [{ ...demoDossier.envVars[0], hasRealValue: true, placeholderCovered: false }],
      status: "built-live" as const,
      missingLiveKeys: [],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        saved = true;
        return Response.json({ success: true });
      }
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) {
        return Response.json(
          wiredResponse({
            counts: saved
              ? { total: 1, hard: 1, soft: 0, builtLive: 1, builtDemo: 0, blockedBuild: 0, planned: 0 }
              : { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
            dossiers: [saved ? liveDossier : demoDossier],
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
      expect(screen.getByText(/Previewn startas om/)).toBeTruthy();
    });

    // Same chat, new version: the receipt must not survive.
    rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);

    await waitFor(() => {
      expect(screen.queryByText(/Previewn startas om/)).toBeNull();
    });

    // The version switch also collapses the row (a separate, pre-existing
    // reset), which alone would hide the receipt regardless of whether
    // `saveConfirmation` itself got cleared. Re-expand it to check the
    // actual state, not the collapse: a missing reset would resurface the
    // stale receipt right here, since the new version's dossier list still
    // contains the same dossier id.
    fireEvent.click(screen.getByRole("button", { name: /OpenAI Chat/i }));
    expect(screen.queryByText(/Previewn startas om/)).toBeNull();
  });

  // Bugbot on this diff (lucka 1 follow-up): removing the generic toast
  // (`useBuilderVmPreview.ts`) also silenced custom-key saves — dossier rows
  // got the inline receipt above, but "Egna nycklar" has no per-row status to
  // quote, so it needs its own plain "it saved" confirmation instead of none.
  it("shows a save confirmation for custom (unowned) keys too, not just dossier rows", async () => {
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

    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    // No confirmation before the save.
    expect(screen.queryByText(/Previewn startas om/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Spara nyckel/i }));

    await waitFor(() => {
      expect(savedCalls.length).toBe(1);
    });
    await waitFor(() => {
      expect(screen.getByText(/Sparat\. Previewn startas om med de nya värdena\./)).toBeTruthy();
    });
  });

  // Bugbot follow-up (second pass on this diff): handleSaveCustomKeys
  // dispatches dispatchProjectEnvVarsUpdated with the OLD versionId to
  // restart THAT version's preview, so this receipt is just as version-scoped
  // as the dossier-row one above and must not survive a version switch.
  it("clears the custom-key save confirmation when only the version changes (not just the chat)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
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

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["MY_CUSTOM_SERVICE_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara nyckel/i }));

    await waitFor(() => {
      expect(screen.getByText(/Sparat\. Previewn startas om med de nya värdena\./)).toBeTruthy();
    });

    // Same chat, new version: the custom-key receipt must not survive.
    rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);

    await waitFor(() => {
      expect(screen.queryByText(/Sparat\. Previewn startas om med de nya värdena\./)).toBeNull();
    });
  });
});

