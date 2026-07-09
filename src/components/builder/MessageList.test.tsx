import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import { buildF3AwaitingInputUiPart } from "@/lib/gen/stream/f3-continuation";
import { MessageList } from "./MessageList";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@streamdown/code", () => ({
  code: () => null,
}));

describe("MessageList", () => {
  it("renders suggestIntegration approvals inline in compact mode without opening reply dialog", async () => {
    // Ägarbeslut 2026-07-03: integrations-/env-frågor ska stanna inline
    // i chatten (compact cards) och inte driva plan-dialogen.
    const messages: ChatMessage[] = [
      {
        id: "assistant_inline_1",
        role: "assistant",
        content: "Här är nästa steg för integrationen.",
        uiParts: [
          {
            type: "tool:integration-suggestion",
            toolName: "Integration suggestion",
            toolCallId: "integration:stripe",
            state: "approval-requested",
            output: {
              question: "Vill du konfigurera Stripe nu?",
              options: ["Godkänn förslag", "Avvisa förslag"],
              provider: "stripe",
              name: "Stripe",
              envVars: ["STRIPE_SECRET_KEY"],
            },
          },
        ],
      },
    ];

    render(<MessageList chatId="chat_inline_1" messages={messages} />);

    await waitFor(() => {
      expect(screen.getByText("Vill du konfigurera Stripe nu?")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Godkänn förslag" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avvisa förslag" })).toBeTruthy();
    expect(screen.queryByText("Svar krävs för att fortsätta")).toBeNull();
  });

  it("shows the actual awaiting-input question without synthetic approval buttons", async () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant_1",
        role: "assistant",
        content: "Jag behöver mer information innan jag kan fortsätta.",
        uiParts: [
          {
            type: "tool:awaiting-input",
            toolName: "Klargörande fråga",
            toolCallId: "awaiting-input:assistant_1",
            state: "input-available",
            output: {
              question: "Vad vill du att jag fokuserar på i nästa ändring?",
              awaitingInput: true,
            },
          },
        ],
      },
    ];

    render(<MessageList chatId="chat_1" messages={messages} />);

    await waitFor(() => {
      expect(screen.getByText("Svar krävs för att fortsätta")).toBeTruthy();
    });

    expect(
      screen.getByText("Vad vill du att jag fokuserar på i nästa ändring?"),
    ).toBeTruthy();
    expect(
      screen.getByText("Svara i chatten för att fortsätta genereringen."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn förslag" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avvisa förslag" })).toBeNull();
  });

  it("sends the selected quick reply from the awaiting-input dialog", async () => {
    const onQuickReply = vi.fn(async () => {});
    const messages: ChatMessage[] = [
      {
        id: "assistant_2",
        role: "assistant",
        content: "Jag behöver mer information innan jag kan fortsätta.",
        uiParts: [
          {
            type: "tool:awaiting-input",
            toolName: "Klargörande fråga",
            toolCallId: "awaiting-input:assistant_2",
            state: "input-available",
            output: {
              question: "Vad vill du att jag fokuserar på i nästa ändring?",
              options: ["Design", "Innehåll"],
              awaitingInput: true,
            },
          },
        ],
      },
    ];

    render(
      <MessageList chatId="chat_1" messages={messages} onQuickReply={onQuickReply} />,
    );

    const designButton = await screen.findByRole("button", { name: "Design" });
    fireEvent.click(designButton);

    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Design", { planMode: false });
    });
  });

  it("shows F3 reload quick-replies INLINE (no dialog, no auto-fire) for an old persisted marker", async () => {
    // Pin change (auto-resolve-f3-popup wave 1): the owner never wants the
    // "Svar krävs"-dialog for the F3-continuation marker. A marker present at
    // MOUNT is reloaded history — it must NOT auto-approve; instead the
    // canonical quick-replies render inline so the user can still choose.
    // (Previously this asserted the dialog opened; that behaviour is now gone.)
    const onQuickReply = vi.fn(async () => {});
    const messages: ChatMessage[] = [
      {
        id: "user_f3_kick",
        role: "user",
        content: "Bygg integrationer nu utifrån den finaliserade designversionen.",
      },
      {
        id: "assistant_f3_marker",
        role: "assistant",
        content: "Integrationer signalerades, men modellen skrev inga kodfiler.",
        uiParts: [
          buildF3AwaitingInputUiPart({
            question:
              "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.",
            parentVersionId: "ver_f2_parent",
          }),
        ],
      },
    ];

    render(
      <MessageList chatId="chat_f3" messages={messages} onQuickReply={onQuickReply} />,
    );

    // Inline quick-replies surface (no dialog).
    const approveButton = await screen.findByRole("button", { name: "Godkänn förslag" });
    expect(screen.getByRole("button", { name: "Avvisa förslag" })).toBeTruthy();
    // The dialog must NOT open for the F3-continuation kind.
    expect(screen.queryByText("Svar krävs för att fortsätta")).toBeNull();
    // A reloaded marker is NOT auto-approved.
    expect(onQuickReply).not.toHaveBeenCalled();

    fireEvent.click(approveButton);
    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Godkänn förslag", { planMode: false });
    });
  });

  it("auto-approves a LIVE F3-continuation marker without a dialog (calm inline row)", async () => {
    // Live scenario: the marker arrives mid-session (its key was not present at
    // mount), so it auto-continues exactly once — no popup, just a calm status
    // row. The server loop-breaker caps repeats (round 3 closes terminally).
    // The send is a controllable deferred so we can assert the spinner while
    // pending AND the fallback after it settles without new content (VADE #460:
    // a failed/contentless auto-send must not leave a perpetual spinner).
    let resolveSend: (() => void) | undefined;
    const onQuickReply = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const before: ChatMessage[] = [
      { id: "user_f3_kick_live", role: "user", content: "Bygg integrationer nu." },
    ];
    // The F3 round streams in this session (isStreaming) — that is the strong
    // "live" signal required for auto-approve (bugbot high på #460: history
    // hydration alone must never authorize an auto-fire).
    const { rerender } = render(
      <MessageList
        chatId="chat_f3_live"
        messages={before}
        onQuickReply={onQuickReply}
        isStreaming
      />,
    );

    const after: ChatMessage[] = [
      ...before,
      {
        id: "assistant_f3_marker_live",
        role: "assistant",
        content: "Integrationer signalerades, men modellen skrev inga kodfiler.",
        uiParts: [
          buildF3AwaitingInputUiPart({
            question:
              "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.",
            parentVersionId: "ver_f2_parent",
          }),
        ],
      },
    ];
    rerender(
      <MessageList
        chatId="chat_f3_live"
        messages={after}
        onQuickReply={onQuickReply}
        isStreaming={false}
      />,
    );

    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Godkänn förslag", { planMode: false });
    });
    // Auto-fires exactly once, no dialog, calm status row while sending.
    expect(onQuickReply).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Svar krävs för att fortsätta")).toBeNull();
    expect(screen.getByText("Integrationsbygget fortsätter automatiskt…")).toBeTruthy();

    // The send settles WITHOUT producing new chat content (the same marker is
    // still latest) — the spinner must clear and the manual inline
    // quick-replies must take over. No automatic retry (still 1 call).
    resolveSend?.();
    await waitFor(() => {
      expect(screen.queryByText("Integrationsbygget fortsätter automatiskt…")).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Godkänn förslag" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avvisa förslag" })).toBeTruthy();
    expect(onQuickReply).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Svar krävs för att fortsätta")).toBeNull();
  });

  it("auto-approves when the F3 marker hydrates one tick after stream-end (design stage — prod-realistic, P1)", async () => {
    // P1 regression lock: a real F3-continuation marker is emitted by a
    // tool-only/empty round that creates NO new version, so
    // `deployReadiness.lifecycleStage` reads the still-active F2 row =
    // "design". Auto-continue MUST therefore work with lifecycleStage="design"
    // — gating arming on "integrations" made the feature dead in prod. The
    // live-vs-stale decision rests on the marker (kind + parentVersionId ===
    // active versionId), not the prop stage.
    let resolveSend: (() => void) | undefined;
    const onQuickReply = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const before: ChatMessage[] = [
      { id: "user_f3_kick", role: "user", content: "Bygg integrationer nu." },
    ];
    const { rerender } = render(
      <MessageList
        chatId="chat_f3_delayed"
        messages={before}
        onQuickReply={onQuickReply}
        isStreaming
        lifecycleStage="design"
        versionId="ver_f2_parent"
      />,
    );

    // Stream ends before the server-persisted marker is merged into messages.
    rerender(
      <MessageList
        chatId="chat_f3_delayed"
        messages={before}
        onQuickReply={onQuickReply}
        isStreaming={false}
        lifecycleStage="design"
        versionId="ver_f2_parent"
      />,
    );

    const after: ChatMessage[] = [
      ...before,
      {
        id: "assistant_f3_marker_live",
        role: "assistant",
        content: "Integrationer signalerades, men modellen skrev inga kodfiler.",
        uiParts: [
          buildF3AwaitingInputUiPart({
            question:
              "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.",
            parentVersionId: "ver_f2_parent",
          }),
        ],
      },
    ];
    rerender(
      <MessageList
        chatId="chat_f3_delayed"
        messages={after}
        onQuickReply={onQuickReply}
        isStreaming={false}
        lifecycleStage="design"
        versionId="ver_f2_parent"
      />,
    );

    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Godkänn förslag", { planMode: false });
    });
    resolveSend?.();
  });

  it("does NOT auto-approve a hydrated marker whose parentVersionId no longer matches the active version (stale lineage, isolated)", async () => {
    // Isolates the parentVersionId gate: a real generation stream DID run this
    // session (so the stream-end window is armed), but the marker that hydrates
    // belongs to a superseded design version (parentVersionId != active
    // versionId). It must fall back to inline quick-replies, never auto-fire.
    const onQuickReply = vi.fn(async () => {});
    const before: ChatMessage[] = [
      { id: "user_kick_stale_lineage", role: "user", content: "Ändra designen." },
    ];
    const { rerender } = render(
      <MessageList
        chatId="chat_stale_lineage"
        messages={before}
        onQuickReply={onQuickReply}
        isStreaming
        lifecycleStage="design"
        versionId="ver_current"
      />,
    );
    rerender(
      <MessageList
        chatId="chat_stale_lineage"
        messages={before}
        onQuickReply={onQuickReply}
        isStreaming={false}
        lifecycleStage="design"
        versionId="ver_current"
      />,
    );

    const withStaleMarker: ChatMessage[] = [
      ...before,
      {
        id: "assistant_stale_lineage_marker",
        role: "assistant",
        content: "Integrationer signalerades, men modellen skrev inga kodfiler.",
        uiParts: [
          buildF3AwaitingInputUiPart({
            question:
              "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.",
            parentVersionId: "ver_superseded",
          }),
        ],
      },
    ];
    rerender(
      <MessageList
        chatId="chat_stale_lineage"
        messages={withStaleMarker}
        onQuickReply={onQuickReply}
        isStreaming={false}
        lifecycleStage="design"
        versionId="ver_current"
      />,
    );

    const approveButton = await screen.findByRole("button", { name: "Godkänn förslag" });
    expect(approveButton).toBeTruthy();
    expect(onQuickReply).not.toHaveBeenCalled();
    expect(screen.queryByText("Integrationsbygget fortsätter automatiskt…")).toBeNull();
  });

  it("does NOT auto-approve a marker that arrives via staged history hydration (no stream ran)", async () => {
    // Bugbot high (#460): cached/local messages can hydrate FIRST without the
    // persisted marker, and the canonical server history (incl. an old
    // marker) lands a beat later. That late append is indistinguishable from
    // a live arrival by list shape, so auto-fire is additionally gated on a
    // generation stream having RUN in this session — a reload never streams
    // before its history lands.
    const onQuickReply = vi.fn(async () => {});
    const cachedSubset: ChatMessage[] = [
      { id: "user_f3_kick_stale", role: "user", content: "Bygg integrationer nu." },
    ];
    const { rerender } = render(
      <MessageList chatId="chat_f3_stale" messages={cachedSubset} onQuickReply={onQuickReply} />,
    );

    const fullServerHistory: ChatMessage[] = [
      ...cachedSubset,
      {
        id: "assistant_f3_marker_stale",
        role: "assistant",
        content: "Integrationer signalerades, men modellen skrev inga kodfiler.",
        uiParts: [
          buildF3AwaitingInputUiPart({
            question:
              "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.",
            parentVersionId: "ver_f2_parent",
          }),
        ],
      },
    ];
    rerender(
      <MessageList
        chatId="chat_f3_stale"
        messages={fullServerHistory}
        onQuickReply={onQuickReply}
      />,
    );

    // Inline quick-replies render; nothing auto-fires, no dialog, no spinner.
    const approveButton = await screen.findByRole("button", { name: "Godkänn förslag" });
    expect(approveButton).toBeTruthy();
    expect(onQuickReply).not.toHaveBeenCalled();
    expect(screen.queryByText("Integrationsbygget fortsätter automatiskt…")).toBeNull();
    expect(screen.queryByText("Svar krävs för att fortsätta")).toBeNull();
  });

  it("does NOT auto-approve a stale marker after an unrelated F2 follow-up stream (A#2)", async () => {
    // Residual from bugbot #460: cached history hydrates WITHOUT the marker,
    // then an F2 follow-up streams (arming the OLD `isStreaming` gate), then
    // canonical server history merges in an OLD F3 marker. The marker looks
    // "live" (key !== mount snapshot) but was NOT produced by the F2 stream.
    const onQuickReply = vi.fn(async () => {});
    const cachedSubset: ChatMessage[] = [
      { id: "user_f3_kick_stale", role: "user", content: "Bygg integrationer nu." },
    ];
    const { rerender } = render(
      <MessageList chatId="chat_f3_f2_hydrate" messages={cachedSubset} onQuickReply={onQuickReply} />,
    );

    // Unrelated F2 follow-up streams and completes WITHOUT an F3 marker.
    const afterF2Stream: ChatMessage[] = [
      ...cachedSubset,
      {
        id: "user_f2_followup",
        role: "user",
        content: "Gör headern större.",
      },
      {
        id: "assistant_f2_reply",
        role: "assistant",
        content: 'file="app/page.tsx"\nexport default function Page() { return <h1>Stor</h1> }',
      },
    ];
    rerender(
      <MessageList
        chatId="chat_f3_f2_hydrate"
        messages={afterF2Stream}
        onQuickReply={onQuickReply}
        isStreaming
        lifecycleStage="design"
      />,
    );
    rerender(
      <MessageList
        chatId="chat_f3_f2_hydrate"
        messages={afterF2Stream}
        onQuickReply={onQuickReply}
        isStreaming={false}
        lifecycleStage="design"
      />,
    );

    // Staged hydration lands the OLD F3 marker AFTER the F2 round (marker is
    // latest pending — no user message after it — but was NOT produced by F2).
    const fullServerHistory: ChatMessage[] = [
      ...cachedSubset,
      {
        id: "user_f2_followup",
        role: "user",
        content: "Gör headern större.",
      },
      {
        id: "assistant_f2_reply",
        role: "assistant",
        content: 'file="app/page.tsx"\nexport default function Page() { return <h1>Stor</h1> }',
      },
      {
        id: "assistant_f3_marker_stale",
        role: "assistant",
        content: "Integrationer signalerades, men modellen skrev inga kodfiler.",
        uiParts: [
          buildF3AwaitingInputUiPart({
            question:
              "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.",
            parentVersionId: "ver_f2_parent",
          }),
        ],
      },
    ];
    rerender(
      <MessageList
        chatId="chat_f3_f2_hydrate"
        messages={fullServerHistory}
        onQuickReply={onQuickReply}
        isStreaming={false}
        lifecycleStage="design"
        versionId="ver_f2_after"
      />,
    );

    const approveButton = await screen.findByRole("button", { name: "Godkänn förslag" });
    expect(approveButton).toBeTruthy();
    expect(onQuickReply).not.toHaveBeenCalled();
    expect(screen.queryByText("Integrationsbygget fortsätter automatiskt…")).toBeNull();
  });

  it("does NOT auto-approve a reloaded marker after switching chats mid-stream (cross-chat credit burn)", async () => {
    // Regression: message restore is gated on `isAnyStreaming`
    // (usePersistedChatMessages), so switching chats WHILE a generation stream
    // is active keeps the previous chat's streaming messages mounted until that
    // stream ends. The old `hasStreamedThisSessionRef = isStreaming` on chat
    // switch (plus the per-render `if (isStreaming)` re-arm) credited that
    // foreign stream to the NEW chat, so a reloaded F3 marker in the new chat's
    // freshly hydrated history auto-fired and burned credits in the wrong chat.
    const onQuickReply = vi.fn(async () => {});

    // Chat A is actively streaming (no F3 marker of its own).
    const chatAStreaming: ChatMessage[] = [
      { id: "user_a", role: "user", content: "Bygg sida A." },
      { id: "assistant_a", role: "assistant", content: "Genererar…", isStreaming: true },
    ];
    const { rerender } = render(
      <MessageList
        chatId="chat_A"
        messages={chatAStreaming}
        onQuickReply={onQuickReply}
        isStreaming
      />,
    );

    // User switches to chat B while A is STILL streaming. Restore is gated on
    // isAnyStreaming, so B momentarily shows A's streaming messages — modeled
    // here as a DISTINCT array (a further stream delta) so the history-baseline
    // snapshot runs against A's markerless messages under chat B (i.e. B's
    // reloaded marker later is NOT caught by the mount-snapshot, leaving the
    // "streamed this session" gate as the deciding factor — the actual bug).
    const chatAStreamingDelta: ChatMessage[] = [
      { id: "user_a", role: "user", content: "Bygg sida A." },
      { id: "assistant_a", role: "assistant", content: "Genererar mer…", isStreaming: true },
    ];
    rerender(
      <MessageList
        chatId="chat_B"
        messages={chatAStreamingDelta}
        onQuickReply={onQuickReply}
        isStreaming
      />,
    );

    // A's stream ends and B's canonical history (incl. an OLD F3 marker) lands.
    const chatBHistory: ChatMessage[] = [
      { id: "user_b", role: "user", content: "Bygg integrationer nu." },
      {
        id: "assistant_b_marker",
        role: "assistant",
        content: "Integrationer signalerades, men modellen skrev inga kodfiler.",
        uiParts: [
          buildF3AwaitingInputUiPart({
            question:
              "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.",
            parentVersionId: "ver_b_parent",
          }),
        ],
      },
    ];
    rerender(
      <MessageList
        chatId="chat_B"
        messages={chatBHistory}
        onQuickReply={onQuickReply}
        isStreaming={false}
      />,
    );

    // The marker is chat B's RELOADED history — no stream ran on B in this
    // session — so it must fall back to the inline quick-replies, never
    // auto-fire.
    const approveButton = await screen.findByRole("button", { name: "Godkänn förslag" });
    expect(approveButton).toBeTruthy();
    expect(onQuickReply).not.toHaveBeenCalled();
    expect(screen.queryByText("Integrationsbygget fortsätter automatiskt…")).toBeNull();
  });
});
