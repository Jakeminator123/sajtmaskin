/**
 * Direkta åtgärder under ett uppdrag (ägarbeslut 2026-11-20): en reparation
 * och en snabbändring körs utan klick när turen bär Sajtagentens
 * handlingsmedgivande (`agent-action-consent.ts`), och förblir förslag när den
 * inte gör det. Direktbygget låses i `OpenClawMessage.bridge.test.tsx`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quickEditChatFiles } from "@/lib/builder/engine-files-patch";
import { QUICK_EDIT_APPLIED_EVENT_NAME } from "@/lib/builder/quick-edit-applied-event";
import { AUTO_FIX_EVENT_NAME } from "@/lib/hooks/chat/auto-fix-events";
import {
  AGENT_MISSION_ACTION_BUDGET,
  claimMissionAction,
  hasMissionAwaitingResult,
} from "@/lib/openclaw/agent-action-consent";
import {
  revokeOpenClawBuildConsent,
  useOpenClawStore,
  type OpenClawMessage as Msg,
} from "@/lib/openclaw/openclaw-store";
import type { OpenClawPowerId } from "@/lib/openclaw/powers";
import { OpenClawMessage, resetOpenClawActionLedgersForTests } from "./OpenClawMessage";

// Mocka ENDAST nätverksklienten; felöversättningen förblir den riktiga.
vi.mock("@/lib/builder/engine-files-patch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/builder/engine-files-patch")>();
  return { ...actual, quickEditChatFiles: vi.fn() };
});

const quickEditMock = vi.mocked(quickEditChatFiles);

const QUICK_EDIT_OK = {
  ok: true as const,
  versionId: "v-2",
  changedFiles: ["app/page.tsx"],
  previewUrl: null,
  previewSessionId: null,
  lifecycleToken: null,
  previewMode: null,
};

function userTurn(id: string, content: string, extra: Partial<Msg> = {}): Msg {
  return {
    id,
    role: "user",
    content,
    timestamp: Date.now() - 500,
    kind: "chat",
    allowBuild: true,
    ...extra,
  };
}

function actionReply(id: string, action: Record<string, unknown>, extra: Partial<Msg> = {}): Msg {
  return {
    id,
    role: "assistant",
    timestamp: Date.now() + 1,
    delivery: "complete",
    content: ["Jag tar hand om det.", "<openclaw-action>", JSON.stringify(action), "</openclaw-action>"].join("\n"),
    ...extra,
  };
}

const REPAIR_ACTION = { type: "request_repair", label: "Laga byggfelen", reason: "Två fynd under BUGGFYND" };
const QUICK_EDIT_ACTION = {
  type: "apply_quick_edit",
  label: "Byt rubriken",
  reason: "Stavfel i hero-rubriken",
  ops: [{ kind: "replace_text", path: "app/page.tsx", find: "Välkomen", replace: "Välkommen" }],
};

function grant(...powers: OpenClawPowerId[]) {
  act(() => {
    useOpenClawStore.setState({ editEnabled: true, powersOn: true, grantedPowers: powers });
  });
}

function seed(...messages: Msg[]) {
  act(() => {
    useOpenClawStore.setState({ messages });
  });
}

/** `isLatestChatVersion` frågar versionslistan; den aktiva versionen är nyast. */
function stubVersions(newestVersionId = "v-1") {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ versions: [{ versionId: newestVersionId, versionNumber: 2 }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let autoFixEvents: CustomEvent[] = [];
const recordAutoFix = (event: Event) => {
  autoFixEvents.push(event as CustomEvent);
};

beforeEach(() => {
  resetOpenClawActionLedgersForTests();
  autoFixEvents = [];
  window.addEventListener(AUTO_FIX_EVENT_NAME, recordAutoFix);
  window.__SITEMASKIN_CONTEXT = { chatId: "chat-1", activeVersionId: "v-1" };
  act(() => {
    useOpenClawStore.setState({
      scopeKey: "/builder::builder::chat-1",
      messages: [],
      armedMandate: null,
      armedContinuation: null,
    });
  });
});

afterEach(() => {
  window.removeEventListener(AUTO_FIX_EVENT_NAME, recordAutoFix);
  delete window.__SITEMASKIN_CONTEXT;
  act(() => {
    useOpenClawStore.setState({
      messages: [],
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      armedMandate: null,
      armedContinuation: null,
    });
  });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("request_repair under ett uppdrag", () => {
  it("startar reparationen direkt och markerar att uppdraget väntar på resultatet", async () => {
    grant("armed_autonomy");
    stubVersions();
    const reply = actionReply("a-repair", REPAIR_ACTION);
    seed(userTurn("u-repair", "Fixa felen i bygget"), reply);

    render(<OpenClawMessage msg={reply} />);

    expect(await screen.findByText(/Reparation startad på den senaste versionen/)).toBeTruthy();
    expect(screen.getByText("Reparation")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn och starta reparation" })).toBeNull();
    expect(autoFixEvents).toHaveLength(1);
    expect(autoFixEvents[0].detail).toEqual({
      chatId: "chat-1",
      versionId: "v-1",
      manual: true,
      reasons: ["openclaw_requested_repair"],
    });
    expect(hasMissionAwaitingResult("/builder::builder::chat-1")).toBe(true);
  });

  it("skickar inte en andra reparation när kortet monteras om", async () => {
    grant("armed_autonomy");
    stubVersions();
    const reply = actionReply("a-repair-remount", REPAIR_ACTION);
    seed(userTurn("u-repair-remount", "Fixa felen i bygget"), reply);

    const first = render(<OpenClawMessage msg={reply} />);
    expect(await screen.findByText(/Reparation startad/)).toBeTruthy();
    first.unmount();
    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByText(/Reparation startad/)).toBeTruthy();
    expect(autoFixEvents).toHaveLength(1);
  });

  it.each([
    { name: "en fråga", turn: userTurn("u-q", "Vad är fel på sajten?", { allowBuild: false }) },
    { name: "läget Fråga", turn: userTurn("u-ask", "Fixa felen i bygget", { allowBuild: false }) },
    { name: "en rad från historiken", turn: userTurn("u-old", "Fixa felen i bygget", { hydrated: true }) },
  ])("förblir ett förslag efter $name", async ({ turn }) => {
    grant("armed_autonomy");
    stubVersions();
    const reply = actionReply("a-repair-card", REPAIR_ACTION);
    seed(turn, reply);

    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(autoFixEvents).toHaveLength(0);
    expect(screen.getByText("Reparationsförslag")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Godkänn och starta reparation" }));
    expect(await screen.findByText(/Reparation startad/)).toBeTruthy();
    expect(autoFixEvents).toHaveLength(1);
  });

  it("kör inte direkt utan befogenheten att agera", async () => {
    grant("quick_edit");
    stubVersions();
    const reply = actionReply("a-repair-nopower", REPAIR_ACTION);
    seed(userTurn("u-repair-nopower", "Fixa felen i bygget"), reply);

    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(autoFixEvents).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Godkänn och starta reparation" })).toBeTruthy();
  });

  it("startar ingenting när en äldre version är vald", async () => {
    grant("armed_autonomy");
    stubVersions("v-9");
    const reply = actionReply("a-repair-old", REPAIR_ACTION);
    seed(userTurn("u-repair-old", "Fixa felen i bygget"), reply);

    render(<OpenClawMessage msg={reply} />);

    expect(
      await screen.findByText(/Reparation kan bara startas på den senaste versionen/),
    ).toBeTruthy();
    expect(autoFixEvents).toHaveLength(0);
    expect(hasMissionAwaitingResult("/builder::builder::chat-1")).toBe(false);
  });

  it("hejdas av ett stopp som kommer medan versionen kontrolleras", async () => {
    grant("armed_autonomy");
    let release!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const reply = actionReply("a-repair-stop", REPAIR_ACTION);
    seed(userTurn("u-repair-stop", "Fixa felen i bygget"), reply);

    render(<OpenClawMessage msg={reply} />);
    await waitFor(() => expect(release).toBeTypeOf("function"));
    act(() => revokeOpenClawBuildConsent());
    await act(async () => {
      release(
        new Response(JSON.stringify({ versions: [{ versionId: "v-1", versionNumber: 2 }] }), {
          status: 200,
        }),
      );
    });

    expect(await screen.findByText(/Det automatiska medgivandet gäller inte längre/)).toBeTruthy();
    expect(autoFixEvents).toHaveLength(0);
  });

  it("blir ett förslag med förklaring när uppdragets steg är slut", async () => {
    grant("armed_autonomy");
    stubVersions();
    for (let step = 0; step < AGENT_MISSION_ACTION_BUDGET; step += 1) {
      claimMissionAction("u-repair-spent", `earlier-${step}`);
    }
    const reply = actionReply("a-repair-spent", REPAIR_ACTION);
    seed(userTurn("u-repair-spent", "Fixa felen i bygget"), reply);

    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(autoFixEvents).toHaveLength(0);
    expect(screen.getByText(/Jag har använt uppdragets automatiska steg/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Godkänn och starta reparation" })).toBeTruthy();
  });
});

describe("apply_quick_edit under ett uppdrag", () => {
  it("genomför ändringen direkt och visar kvittot", async () => {
    grant("quick_edit");
    quickEditMock.mockResolvedValue(QUICK_EDIT_OK);
    const applied = vi.fn();
    window.addEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, applied);
    const reply = actionReply("a-edit", QUICK_EDIT_ACTION, {
      builderTarget: { chatId: "chat-1", versionId: "v-1" },
    });
    seed(userTurn("u-edit", "Kan du rätta stavfelet i rubriken?"), reply);

    render(<OpenClawMessage msg={reply} />);

    expect(await screen.findByText(/Klart — ny version skapad \(v-2\)/)).toBeTruthy();
    expect(screen.getByText("Snabbändring")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn och genomför" })).toBeNull();
    // Kvittot visar fortfarande exakt vad som skrevs.
    expect(screen.getByText("Välkomen")).toBeTruthy();
    expect(screen.getByText("Välkommen")).toBeTruthy();
    expect(quickEditMock).toHaveBeenCalledTimes(1);
    expect(quickEditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        baseVersionId: "v-1",
        engineLatestKnownVersionId: "v-1",
      }),
    );
    expect(applied).toHaveBeenCalledTimes(1);
    window.removeEventListener(QUICK_EDIT_APPLIED_EVENT_NAME, applied);
  });

  it("skriver inte samma ändring två gånger när kortet monteras om", async () => {
    grant("quick_edit");
    quickEditMock.mockResolvedValue(QUICK_EDIT_OK);
    const reply = actionReply("a-edit-remount", QUICK_EDIT_ACTION);
    seed(userTurn("u-edit-remount", "Rätta stavfelet i rubriken"), reply);

    const first = render(<OpenClawMessage msg={reply} />);
    expect(await screen.findByText(/Klart — ny version skapad/)).toBeTruthy();
    first.unmount();
    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByText(/Klart — ny version skapad \(v-2\)/)).toBeTruthy();
    expect(quickEditMock).toHaveBeenCalledTimes(1);
  });

  it("visar builderns fel och försöker inte igen av sig självt", async () => {
    grant("quick_edit");
    quickEditMock.mockResolvedValue({
      ok: false,
      status: 409,
      code: "stale_base_version",
      error: "stale",
    } as never);
    const reply = actionReply("a-edit-stale", QUICK_EDIT_ACTION);
    seed(userTurn("u-edit-stale", "Rätta stavfelet i rubriken"), reply);

    const first = render(<OpenClawMessage msg={reply} />);
    await waitFor(() => expect(quickEditMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Genomför ändringen…")).toBeNull());
    expect(screen.queryByText(/Klart — ny version skapad/)).toBeNull();
    first.unmount();
    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(quickEditMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: "en fråga", turn: userTurn("u-q", "Vad står det i rubriken?", { allowBuild: false }) },
    { name: "läget Fråga", turn: userTurn("u-ask", "Rätta stavfelet", { allowBuild: false }) },
    { name: "en rad från historiken", turn: userTurn("u-old", "Rätta stavfelet", { hydrated: true }) },
  ])("förblir ett förslag efter $name", async ({ turn }) => {
    grant("quick_edit");
    quickEditMock.mockResolvedValue(QUICK_EDIT_OK);
    const reply = actionReply("a-edit-card", QUICK_EDIT_ACTION);
    seed(turn, reply);

    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(quickEditMock).not.toHaveBeenCalled();
    expect(screen.getByText("Snabbändringsförslag")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));
    expect(await screen.findByText(/Klart — ny version skapad/)).toBeTruthy();
    expect(quickEditMock).toHaveBeenCalledTimes(1);
  });

  it("kräver befogenheten Snabbändringar även när turen bär medgivande", async () => {
    grant("armed_autonomy");
    quickEditMock.mockResolvedValue(QUICK_EDIT_OK);
    const reply = actionReply("a-edit-nopower", QUICK_EDIT_ACTION);
    seed(userTurn("u-edit-nopower", "Rätta stavfelet i rubriken"), reply);

    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(quickEditMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Snabbändringar är inaktiverade/)).toBeTruthy();
  });

  // Oberoende granskning av #1760: en snabbändring som visades som förslag
  // medan befogenheten var av får inte skrivas i efterhand när den slås på.
  it("skriver inte ett gammalt förslag när Snabbändringar slås på igen", async () => {
    grant("armed_autonomy");
    quickEditMock.mockResolvedValue(QUICK_EDIT_OK);
    const reply = actionReply("a-edit-relatch", QUICK_EDIT_ACTION);
    seed(userTurn("u-edit-relatch", "Rätta stavfelet i rubriken"), reply);

    render(<OpenClawMessage msg={reply} />);
    expect(screen.getByText(/Snabbändringar är inaktiverade/)).toBeTruthy();

    grant("armed_autonomy", "quick_edit");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(quickEditMock).not.toHaveBeenCalled();
    expect(screen.getByText("Snabbändringsförslag")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Godkänn och genomför" }));
    expect(await screen.findByText(/Klart — ny version skapad/)).toBeTruthy();
    expect(quickEditMock).toHaveBeenCalledTimes(1);
  });

  it("väntar tills svaret är färdigt och kör aldrig ett avbrutet svar", async () => {
    grant("quick_edit");
    quickEditMock.mockResolvedValue(QUICK_EDIT_OK);
    const streaming = actionReply("a-edit-stream", QUICK_EDIT_ACTION, { delivery: "streaming" });
    seed(userTurn("u-edit-stream", "Rätta stavfelet i rubriken"), streaming);

    const { rerender } = render(<OpenClawMessage msg={streaming} streaming />);
    expect(quickEditMock).not.toHaveBeenCalled();
    rerender(<OpenClawMessage msg={{ ...streaming, delivery: "interrupted" }} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(quickEditMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Förslaget har inte körts");
  });
});
