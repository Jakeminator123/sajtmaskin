import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelDossiers } from "./PreviewPanelDossiers";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import { catalogResponse, stubFetch, wiredResponse } from "./PreviewPanelDossiers.test-support";

describe("PreviewPanelDossiers env mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("saves a filled key to the project env-vars API without sending any chat message", async () => {
    const demoResponse = wiredResponse({
      counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
      dossiers: [
        {
          id: "openai-chat",
          label: "OpenAI Chat",
          class: "hard",
          capability: "ai-chat",
          summary: "Chatbot via OpenAI.",
          complexity: "medium",
          requiresF3: true,
          configured: false,
          dependencies: [],
          envVars: [
            {
              key: "OPENAI_API_KEY",
              required: true,
              enforcement: "feature-runtime",
              purpose: "OpenAI auth.",
              hasRealValue: false,
              placeholderCovered: true,
            },
          ],
          status: "built-demo",
          missingKeys: [],
          missingLiveKeys: ["OPENAI_API_KEY"],
          lastVerified: "2026-01-01",
        },
      ],
    });
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
        return Response.json(demoResponse);
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onRequestDossier = vi.fn();

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        onRequestDossier={onRequestDossier}
      />,
    );

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-my-secret-key" } });
    const dossierFetchCallsBeforeSave = fetchMock.mock.calls.filter(
      (call) => String(call[0]).includes("/chats/") && String(call[0]).includes("/dossiers"),
    ).length;
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(savedCalls.length).toBe(1);
    });
    expect(savedCalls[0].url).toContain("/api/v0/projects/proj_1/env-vars");
    expect(savedCalls[0].body).toEqual({
      vars: [{ key: "OPENAI_API_KEY", value: "sk-my-secret-key", sensitive: true }],
      upsert: true,
    });
    // No chat transport involved (catalog picks are the only chat bridge).
    expect(onRequestDossier).not.toHaveBeenCalled();
    // The save event triggers a status refetch (demo → live comes from data).
    await waitFor(() => {
      const after = fetchMock.mock.calls.filter(
        (call) => String(call[0]).includes("/chats/") && String(call[0]).includes("/dossiers"),
      ).length;
      expect(after).toBeGreaterThan(dossierFetchCallsBeforeSave);
    });
    // The cleared input never echoes the secret back into the DOM.
    expect(document.body.innerHTML).not.toContain("sk-my-secret-key");
  });

  // Delete surface (P2 BB#envdel1): the removed ProjectEnvVarsPanel was the
  // only UI that could DELETE a stored key — the Byggblock popover must offer
  // a remove path for configured keys against the canonical DELETE API.
  it("deletes a configured key via the project env-vars DELETE API", async () => {
    const configuredResponse = wiredResponse({
      counts: { total: 1, hard: 1, soft: 0, builtLive: 1, builtDemo: 0, blockedBuild: 0, planned: 0 },
      dossiers: [
        {
          id: "openai-chat",
          label: "OpenAI Chat",
          class: "hard",
          capability: "ai-chat",
          summary: "Chatbot via OpenAI.",
          complexity: "medium",
          requiresF3: true,
          configured: true,
          dependencies: [],
          envVars: [
            {
              key: "OPENAI_API_KEY",
              required: true,
              enforcement: "feature-runtime",
              purpose: "OpenAI auth.",
              hasRealValue: true,
              placeholderCovered: false,
            },
          ],
          status: "built-live",
          missingKeys: [],
          missingLiveKeys: [],
          lastVerified: "2026-01-01",
        },
      ],
    });
    const deleteCalls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        deleteCalls.push({
          url,
          method: String(init?.method ?? "GET"),
          body: JSON.parse(String(init?.body ?? "null")),
        });
        return Response.json({ success: true });
      }
      if (url.includes("/api/dossiers/catalog")) {
        return Response.json(catalogResponse());
      }
      if (url.includes("/dossiers")) {
        return Response.json(configuredResponse);
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    // Configured key → no input, but "Ändra värde" + "Ta bort" actions.
    const deleteButton = await screen.findByRole("button", { name: "Ta bort" });
    const dossierFetchCallsBeforeDelete = fetchMock.mock.calls.filter(
      (call) => String(call[0]).includes("/chats/") && String(call[0]).includes("/dossiers"),
    ).length;
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1);
    });
    expect(deleteCalls[0].url).toContain("/api/v0/projects/proj_1/env-vars");
    expect(deleteCalls[0].method).toBe("DELETE");
    expect(deleteCalls[0].body).toEqual({ keys: ["OPENAI_API_KEY"] });
    // The deleted-event triggers a status refetch (live → demo comes from data).
    await waitFor(() => {
      const after = fetchMock.mock.calls.filter(
        (call) => String(call[0]).includes("/chats/") && String(call[0]).includes("/dossiers"),
      ).length;
      expect(after).toBeGreaterThan(dossierFetchCallsBeforeDelete);
    });
  });

  // Regression (Bugbot on this diff): a typed-but-unsaved secret draft must
  // not survive a chat switch — the panel stays mounted across chats, and a
  // stale draft could otherwise be saved into the NEXT chat's project.
  it("clears unsaved key drafts when the chat changes", async () => {
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
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
        dossiers: [demoDossier],
      }),
    });

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });
    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-draft-secret" } });
    expect((input as HTMLInputElement).value).toBe("sk-draft-secret");

    rerender(<PreviewPanelDossiers chatId="chat_2" versionId="ver_1" />);
    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });
    const inputAfterSwitch = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    expect((inputAfterSwitch as HTMLInputElement).value).toBe("");
  });

  // Regression (Bugbot on this diff): the 412 focus request must survive the
  // refetch the open-event itself triggers — the target dossier may only
  // exist in the fresher response.
  it("lets the user add an arbitrary UPPER_SNAKE key manually and rejects invalid names", async () => {
    // A wired dossier keeps "Inkopplade" as the default tab, where the
    // custom-keys section lives.
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 0, soft: 1, builtLive: 0, builtDemo: 0, blockedBuild: 0, planned: 0 },
        dossiers: [
          {
            id: "gallery-lightbox",
            label: "Bildgalleri med lightbox",
            class: "soft",
            capability: "gallery-lightbox",
            summary: "Click-to-enlarge image gallery.",
            complexity: "simple",
            requiresF3: false,
            configured: true,
            dependencies: [],
            envVars: [],
            status: "self-contained",
            missingKeys: [],
            missingLiveKeys: [],
            lastVerified: "2026-01-01",
          },
        ],
      }),
    });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel();
    });

    const nameInput = await screen.findByLabelText("Namn på egen env-nyckel");
    fireEvent.change(nameInput, { target: { value: "not a key!" } });
    fireEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(screen.getByText(/Ogiltigt nyckelnamn/i)).toBeTruthy();

    fireEvent.change(nameInput, { target: { value: "my_new_key" } });
    fireEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    // Uppercased and rendered with its own value input.
    expect(await screen.findByLabelText("Värde för MY_NEW_KEY")).toBeTruthy();
    expect(screen.queryByText(/Ogiltigt nyckelnamn/i)).toBeNull();
  });

});

