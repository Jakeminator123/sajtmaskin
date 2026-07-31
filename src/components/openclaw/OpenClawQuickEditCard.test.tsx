import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenClawMessage } from "./OpenClawMessage";
import { useOpenClawStore, type OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";
import { quickEditChatFiles } from "@/lib/builder/engine-files-patch";

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

  it("disables approval when no active builder version is available", () => {
    delete window.__SITEMASKIN_CONTEXT;
    useOpenClawStore.setState({ editEnabled: true });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    expect(screen.getByText(/Öppna en version i buildern först/)).toBeTruthy();
    const approve = screen.getByRole("button", {
      name: "Godkänn och genomför",
    }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
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

  it("declines without calling quickEditChatFiles", () => {
    useOpenClawStore.setState({ editEnabled: true });
    render(<OpenClawMessage msg={quickEditMessage()} />);

    fireEvent.click(screen.getByRole("button", { name: "Avböj" }));

    expect(screen.getByText("Förslaget avböjdes.")).toBeTruthy();
    expect(quickEditMock).not.toHaveBeenCalled();
  });
});
