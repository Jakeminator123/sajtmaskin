import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenClawMessage } from "./OpenClawMessage";
import { useOpenClawStore, type OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";
import { quickEditChatFiles } from "@/lib/builder/engine-files-patch";
import {
  QUICK_EDIT_APPLIED_EVENT_NAME,
  readQuickEditAppliedEventPayload,
} from "@/lib/builder/quick-edit-applied-event";

// Mocka ENDAST nätverksklienten — describeQuickEditHardError förblir den
// riktiga översättningen så testerna låser den svenska felcopyn.
vi.mock("@/lib/builder/engine-files-patch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/builder/engine-files-patch")>();
  return { ...actual, quickEditChatFiles: vi.fn() };
});

const quickEditMock = vi.mocked(quickEditChatFiles);

const QUICK_EDIT_ACTION_JSON = JSON.stringify({
  type: "apply_quick_edit",
  label: "Byt rubriken",
  reason: "Stavfel i hero-rubriken",
  ops: [
    { kind: "replace_text", path: "app/page.tsx", find: "Välkomen", replace: "Välkommen" },
    { kind: "delete_file", path: "components/unused.tsx" },
  ],
});

function quickEditMessage(): Msg {
  return {
    id: "msg-1",
    role: "assistant",
    timestamp: Date.now(),
    content: [
      "Jag föreslår en liten ändring.",
      "<openclaw-action>",
      QUICK_EDIT_ACTION_JSON,
      "</openclaw-action>",
    ].join("\n"),
  };
}

beforeEach(() => {
  window.__SITEMASKIN_CONTEXT = { chatId: "chat-1", activeVersionId: "v-1" };
});

afterEach(() => {
  delete window.__SITEMASKIN_CONTEXT;
  // Store-återställning medan kort fortfarande är monterade → wrappa i act
  // så React inte varnar för osynkade state-uppdateringar.
  act(() => {
    useOpenClawStore.setState({ editEnabled: false, armedMandate: null });
  });
  vi.clearAllMocks();
});

describe("OpenClawQuickEditCard — gating", () => {
  it("renders the OC_EDIT-off info box instead of an approval card when editEnabled is false", () => {
    useOpenClawStore.setState({ editEnabled: false });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    expect(screen.getByText(/Redigeringsläge är av — aktivera OC_EDIT/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn och genomför" })).toBeNull();
    expect(quickEditMock).not.toHaveBeenCalled();
  });

  it("renders the approval card with label, reason and affected files when editEnabled is true", () => {
    useOpenClawStore.setState({ editEnabled: true });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    expect(screen.getByText("Snabbändringsförslag")).toBeTruthy();
    expect(screen.getByText("Byt rubriken")).toBeTruthy();
    expect(screen.getByText("Stavfel i hero-rubriken")).toBeTruthy();
    expect(screen.getByText("app/page.tsx")).toBeTruthy();
    expect(screen.getByText("components/unused.tsx")).toBeTruthy();
    expect(screen.getByText("ersätt text")).toBeTruthy();
    expect(screen.getByText("ta bort fil")).toBeTruthy();
    // Payload-transparens: exakt find/replace ska synas före godkännande.
    expect(screen.getByText("Välkomen")).toBeTruthy();
    expect(screen.getByText("Välkommen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Godkänn och genomför" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avböj" })).toBeTruthy();
    expect(quickEditMock).not.toHaveBeenCalled();
  });

  it("never auto-executes — even with an active armed mandate", async () => {
    useOpenClawStore.setState({
      editEnabled: true,
      armedMandate: {
        mode: "followups",
        remaining: 5,
        reason: "gör 5 follow-ups och buggranska",
        createdAt: Date.now() - 1_000,
      },
    });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    // Ge eventuella mount-effekter en chans att (felaktigt) köra.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(quickEditMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Godkänn och genomför" })).toBeTruthy();
  });

  it("fails with a clear message when no builder version exists at approval", async () => {
    delete window.__SITEMASKIN_CONTEXT;
    useOpenClawStore.setState({ editEnabled: true });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    expect(screen.getByText(/Kräver en öppen version i buildern/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));

    await waitFor(() => {
      expect(screen.getByText(/Ingen aktiv version hittades/)).toBeTruthy();
    });
    expect(quickEditMock).not.toHaveBeenCalled();
  });
});

describe("OpenClawQuickEditCard — execution", () => {
  it("runs quickEditChatFiles with the active chat/version on approval and shows the result", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    quickEditMock.mockResolvedValue({
      ok: true,
      versionId: "v-2",
      changedFiles: ["app/page.tsx", "components/unused.tsx"],
      previewUrl: null,
      previewSessionId: null,
      previewMode: null,
    });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));

    await waitFor(() => {
      expect(screen.getByText(/Klart — ny version skapad \(v-2\)/)).toBeTruthy();
    });
    expect(screen.getByText(/app\/page\.tsx, components\/unused\.tsx/)).toBeTruthy();
    expect(quickEditMock).toHaveBeenCalledTimes(1);
    expect(quickEditMock).toHaveBeenCalledWith({
      chatId: "chat-1",
      baseVersionId: "v-1",
      engineLatestKnownVersionId: "v-1",
      summary: "Byt rubriken",
      ops: [
        { kind: "replace_text", path: "app/page.tsx", find: "Välkomen", replace: "Välkommen" },
        { kind: "delete_file", path: "components/unused.tsx" },
      ],
    });
  });

  it("dispatches the quick-edit-applied window event so the builder syncs to the new version", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    quickEditMock.mockResolvedValue({
      ok: true,
      versionId: "v-2",
      changedFiles: ["app/page.tsx"],
      previewUrl: "https://vm.example/p/abc",
      previewSessionId: "psid-1",
      previewMode: "dev_only",
    });
    const handler = vi.fn();
    window.addEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, handler as EventListener);

    try {
      render(<OpenClawMessage msg={quickEditMessage()} />);
      fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));

      await waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
      const event = handler.mock.calls[0]?.[0] as Event;
      expect(readQuickEditAppliedEventPayload(event)).toEqual({
        chatId: "chat-1",
        versionId: "v-2",
        previewUrl: "https://vm.example/p/abc",
        previewSessionId: "psid-1",
        previewMode: "dev_only",
      });
    } finally {
      window.removeEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, handler as EventListener);
    }
  });

  it("does not dispatch the quick-edit-applied event on failure", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    quickEditMock.mockResolvedValue({ ok: false, error: "stale_base_version" });
    const handler = vi.fn();
    window.addEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, handler as EventListener);

    try {
      render(<OpenClawMessage msg={quickEditMessage()} />);
      fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));

      await waitFor(() => {
        expect(screen.getByText(/En nyare version finns redan/)).toBeTruthy();
      });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, handler as EventListener);
    }
  });

  it("translates stale_base_version to the Swedish reload copy", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    quickEditMock.mockResolvedValue({ ok: false, error: "stale_base_version" });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "En nyare version finns redan. Ladda om för att fortsätta från den senaste versionen.",
        ),
      ).toBeTruthy();
    });
  });

  it("translates base_busy to the Swedish verify-lock copy", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    quickEditMock.mockResolvedValue({
      ok: false,
      error: "Base version is busy",
      reason: "base_busy",
    });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));

    await waitFor(() => {
      expect(screen.getByText(/Versionen verifieras just nu/)).toBeTruthy();
    });
  });

  it("blocks replace_content on a file missing from the version (no silent file create)", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [{ name: "app/page.tsx" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <OpenClawMessage
          msg={{
            id: "msg-rc",
            role: "assistant",
            timestamp: Date.now(),
            content: [
              "Förslag.",
              "<openclaw-action>",
              JSON.stringify({
                type: "apply_quick_edit",
                label: "Ny fil",
                ops: [{ kind: "replace_content", path: "components/new-file.tsx", content: "x" }],
              }),
              "</openclaw-action>",
            ].join("\n"),
          }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));

      await waitFor(() => {
        expect(screen.getByText(/Filen finns inte i versionen: components\/new-file\.tsx/)).toBeTruthy();
      });
      expect(quickEditMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("lets replace_content through when the file exists and fails closed when the list cannot be fetched", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    const existingFileAction = JSON.stringify({
      type: "apply_quick_edit",
      label: "Uppdatera sidan",
      ops: [{ kind: "replace_content", path: "app/page.tsx", content: "export default 1;" }],
    });
    const message = (id: string): Msg => ({
      id,
      role: "assistant",
      timestamp: Date.now(),
      content: ["Förslag.", "<openclaw-action>", existingFileAction, "</openclaw-action>"].join("\n"),
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [{ name: "app/page.tsx" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    quickEditMock.mockResolvedValue({
      ok: true,
      versionId: "v-2",
      changedFiles: ["app/page.tsx"],
      previewUrl: null,
      previewSessionId: null,
      previewMode: null,
    });

    try {
      const { unmount } = render(<OpenClawMessage msg={message("msg-ok")} />);
      fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));
      await waitFor(() => {
        expect(quickEditMock).toHaveBeenCalledTimes(1);
      });
      unmount();

      // Fail-closed: fillistan går inte att hämta → ingen ändring genomförs.
      quickEditMock.mockClear();
      fetchMock.mockRejectedValue(new Error("network"));
      render(<OpenClawMessage msg={message("msg-fail")} />);
      fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));
      await waitFor(() => {
        expect(screen.getByText(/Kunde inte verifiera versionens filer/)).toBeTruthy();
      });
      expect(quickEditMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("pins ops to the version the model saw at send time, not the active one at approval", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    quickEditMock.mockResolvedValue({
      ok: true,
      versionId: "v-2",
      changedFiles: ["app/page.tsx"],
      previewUrl: null,
      previewSessionId: null,
      previewMode: null,
    });
    // Aktiv version har hunnit flytta till v-9 — men turen skickades mot v-1.
    window.__SITEMASKIN_CONTEXT = { chatId: "chat-1", activeVersionId: "v-9" };
    render(
      <OpenClawMessage
        msg={{
          ...quickEditMessage(),
          builderTarget: { chatId: "chat-1", versionId: "v-1" },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));

    await waitFor(() => {
      expect(quickEditMock).toHaveBeenCalledTimes(1);
    });
    expect(quickEditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersionId: "v-1",
        engineLatestKnownVersionId: "v-1",
      }),
    );
  });

  it("resolves the live builder target at CLICK time when the message carries none", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    delete window.__SITEMASKIN_CONTEXT;
    quickEditMock.mockResolvedValue({
      ok: true,
      versionId: "v-2",
      changedFiles: ["app/page.tsx"],
      previewUrl: null,
      previewSessionId: null,
      previewMode: null,
    });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    // Builder-kontexten blir tillgänglig EFTER render, utan att panelen
    // re-renderar (window-mutation) — klicket ska ändå hitta målet live.
    window.__SITEMASKIN_CONTEXT = { chatId: "chat-1", activeVersionId: "v-1" };
    fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));

    await waitFor(() => {
      expect(quickEditMock).toHaveBeenCalledTimes(1);
    });
    expect(quickEditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        baseVersionId: "v-1",
        engineLatestKnownVersionId: "v-1",
      }),
    );
  });

  it("guards against double-click: two rapid approvals run quickEditChatFiles once", async () => {
    useOpenClawStore.setState({ editEnabled: true });
    let resolveQuickEdit: ((value: Awaited<ReturnType<typeof quickEditChatFiles>>) => void) | null =
      null;
    quickEditMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuickEdit = resolve;
        }),
    );
    render(<OpenClawMessage msg={quickEditMessage()} />);

    const approve = screen.getByRole("button", { name: "Godkänn och genomför" });
    fireEvent.click(approve);
    fireEvent.click(approve);

    await waitFor(() => {
      expect(quickEditMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveQuickEdit?.({
        ok: true,
        versionId: "v-2",
        changedFiles: ["app/page.tsx"],
        previewUrl: null,
        previewSessionId: null,
        previewMode: null,
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Klart — ny version skapad/)).toBeTruthy();
    });
    expect(quickEditMock).toHaveBeenCalledTimes(1);
  });

  it("declines without calling quickEditChatFiles", () => {
    useOpenClawStore.setState({ editEnabled: true });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    fireEvent.click(screen.getByRole("button", { name: "Avböj" }));

    expect(screen.getByText("Förslaget avböjdes.")).toBeTruthy();
    expect(quickEditMock).not.toHaveBeenCalled();
  });
});
