import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PROMPT_SOURCE_UI_PART_TYPE, type ChatMessage } from "@/lib/builder/types";
import { buildPlanModeAssistantMessage } from "@/lib/gen/plan/review";
import { buildF3AwaitingInputUiPart } from "@/lib/gen/stream/f3-continuation";
import { MessageList } from "./MessageList";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@streamdown/code", () => ({
  code: () => null,
}));

function readyBuildPlan() {
  return {
    goal: "Brochure",
    siteType: "brochure",
    scope: ["Hem", "Kontakt"],
    pages: [
      { id: "home", path: "/", name: "Hem", intent: "Start", sections: [] },
      { id: "contact", path: "/kontakt", name: "Kontakt", intent: "Kontakt", sections: [] },
    ],
    steps: [
      { id: "s1", title: "Bygg startsidan", description: "Hem och kontakt", phase: "build" },
    ],
    blockers: [],
  };
}

describe("MessageList", () => {
  it("keeps completed review panels inside the shared details while their warning stays visible", () => {
    render(<MessageList chatId="chat_review" messages={[{
      id: "assistant_review", role: "assistant", content: "Menyn är uppdaterad.",
      uiParts: [{ type: "tool:quality-gate", toolName: "Quality gate", state: "output-available",
        output: { passed: true, designAdvisory: true, checks: [
          { check: "typecheck", passed: false, advisory: true, exitCode: 1, output: "TS2322" },
        ] } }],
    }]} />);
    expect(screen.getAllByTestId("generation-surface")).toHaveLength(1);
    expect(screen.getByText("Kontroller att se över")).toBeTruthy();
    expect(screen.queryByText("Quality gate")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Visa detaljer" }));
    expect(screen.getAllByText("Quality gate").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Den genererade sajten behöver denna integration/)).toBeNull();
  });

  it.each([
    [false, "Status: quality gate körs fortfarande"],
    [true, "Status: autofix är köad efter post-check"],
  ])("renders the actual post-check result in shared details (autofix: %s)", (autoFixQueued, status) => {
    render(<MessageList chatId="chat_postcheck" lifecycleStage="integrations" messages={[{
      id: "assistant_postcheck", role: "assistant", content: "Ändringarna är sparade.",
      uiParts: [{ type: "tool:post-check", state: "output-available", output: {
        summary: { files: 3, added: 1, modified: 2, removed: 0, warnings: 1,
          provisional: true, qualityGatePending: true, autoFixQueued },
        demoUrl: "https://preview.example/updated",
      } }],
    }]} />);

    expect(screen.getByText("Kontroller att se över")).toBeTruthy();
    expect(screen.queryByText("Post-check-sammanfattning")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Visa detaljer" }));
    expect(screen.getByText("Post-check-sammanfattning")).toBeTruthy();
    expect(screen.getByText("Filer: 3")).toBeTruthy();
    expect(screen.getByText("Varningar: 1")).toBeTruthy();
    expect(screen.getByText(status)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Öppna preview-länk" }).getAttribute("href"))
      .toBe("https://preview.example/updated");
    expect(screen.queryByText(/Den genererade sajten behöver denna integration/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Visa integrationer" })).toBeNull();
  });

  it("keeps a retry-pending verification visible when its skipped gate is inside closed details", () => {
    const reason = "Preview kunde inte synkas; versionen lämnas pending.";
    render(<MessageList chatId="chat_hold" messages={[{
      id: "assistant_hold", role: "assistant", content: "Ändringarna är sparade.",
      uiParts: [{ type: "tool:quality-gate", state: "output-available", output: {
        skipped: true, retryPending: true, reason,
      } }],
    }]} />);

    expect(screen.getByTestId("generation-surface").getAttribute("data-attention")).toBe("true");
    expect(screen.getByText("Kontroller att se över")).toBeTruthy();
    expect(screen.queryByText(new RegExp(reason))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Visa detaljer" }));
    expect(screen.getByText(new RegExp(reason))).toBeTruthy();
  });

  it("says the verification is still running when the post-check has no warnings", () => {
    const pending: ChatMessage[] = [{
      id: "assistant_pending", role: "assistant", content: "Ändringarna är sparade.",
      uiParts: [{ type: "tool:post-check", toolCallId: "post-check:ver-1", state: "output-available",
        output: {
          summary: { files: 2, added: 0, modified: 2, removed: 0, warnings: 0,
            provisional: true, qualityGatePending: true, autoFixQueued: false },
          demoUrl: "https://preview.example/pending",
        } }],
    }];
    const { rerender } = render(<MessageList chatId="chat_pending" messages={pending} />);

    const surface = screen.getByTestId("generation-surface");
    expect(surface.getAttribute("data-verifying")).toBe("true");
    expect(surface.getAttribute("data-attention")).toBe("false");
    expect(screen.getByText("Verifieringen pågår")).toBeTruthy();
    expect(screen.queryByText("Genereringen har avslutats.")).toBeNull();

    rerender(<MessageList chatId="chat_pending" messages={[{
      ...pending[0],
      uiParts: [...(pending[0].uiParts ?? []),
        { type: "tool:quality-gate", toolCallId: "quality-gate:ver-1", state: "output-available",
          output: { passed: true, checks: [
            { check: "typecheck", passed: true, exitCode: 0, output: "" },
          ] } }],
    }]} />);
    expect(screen.getByTestId("generation-surface").getAttribute("data-verifying")).toBe("false");
    expect(screen.queryByText("Verifieringen pågår")).toBeNull();
  });

  it("surfaces an available server repair without opening the details drawer", () => {
    render(<MessageList chatId="chat_repair_offer" messages={[{
      id: "assistant_repair_offer", role: "assistant", content: "Byggfelet är lagat.",
      uiParts: [{ type: "tool:quality-gate", toolName: "Server repair",
        toolCallId: "server-repair-available:ver-1", state: "output-available",
        output: { repaired: true, status: "repair_available",
          reason: "En serverreparation finns tillgänglig och kan accepteras i versionspanelen." } }],
    }]} />);

    expect(screen.getByText("Fix finns att acceptera i versionspanelen")).toBeTruthy();
    expect(screen.queryByText("Serverreparation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Visa detaljer" }));
    expect(screen.getAllByText("Fixen är klar – men inte applicerad ännu").length).toBeGreaterThan(0);
  });

  it("uses the assistant surface for repair progress without a second guessed phase indicator", () => {
    render(<MessageList chatId="chat_repair" isStreaming messages={[
      { id: "repair_prompt", role: "user", content: "Rätta syntaxfelet.",
        uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "autofix" }] },
      { id: "repair_answer", role: "assistant", content: "", isStreaming: true },
    ]} />);
    expect(screen.getByText("Automatisk reparation")).toBeTruthy();
    expect(screen.getAllByTestId("generation-surface")).toHaveLength(1);
    expect(screen.queryByText("LLM tänker")).toBeNull();
    expect(screen.queryByText("Automatisk kodreparation pågår")).toBeNull();
  });

  it("renders current engine progress prominently while the assistant is streaming", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant_live_progress",
        role: "assistant",
        content: "",
        isStreaming: true,
        uiParts: [
          {
            type: "tool:engine-validate_syntax",
            toolName: "Validering (syntax + typecheck)",
            toolCallId: "progress:validate_syntax",
            state: "input-streaming",
            output: {
              steps: ["Validerar genererad kod (pass 1)"],
            },
          },
        ],
      },
    ];

    render(<MessageList chatId="chat_live_progress" messages={messages} isStreaming />);

    expect(screen.getByText("Arbetar med din sajt")).toBeTruthy();
    expect(
      screen.getAllByText("Validerar genererad kod (pass 1)").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pågår")).toBeTruthy();
  });

  it("surfaces a terminal tool error in the live header while the stream continues", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant_live_error",
        role: "assistant",
        content: "",
        isStreaming: true,
        uiParts: [
          {
            type: "tool:engine-preview",
            toolName: "Live-preview",
            toolCallId: "progress:preview",
            state: "output-error",
            output: {
              steps: ["Live-preview kunde inte starta: npm failed"],
            },
          },
        ],
      },
    ];

    render(<MessageList chatId="chat_live_error" messages={messages} isStreaming />);

    expect(screen.getByText("Ett byggsteg misslyckades")).toBeTruthy();
    expect(
      screen.getAllByText("Live-preview kunde inte starta: npm failed").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Fortsätter med nästa byggsteg.")).toBeNull();
  });

  it("never leaves an older turn active after the user starts a newer generation", () => {
    const messages: ChatMessage[] = [
      { id: "user_old", role: "user", content: "Bygg första versionen." },
      {
        id: "assistant_old",
        role: "assistant",
        content: "Första versionen är klar.",
        isStreaming: false,
        uiParts: [
          {
            type: "tool:quality-gate",
            toolName: "Quality gate",
            toolCallId: "quality-gate:old",
            state: "input-streaming",
          },
        ],
      },
      { id: "user_new", role: "user", content: "Gör nästa ändring." },
      {
        id: "assistant_new",
        role: "assistant",
        content: "",
        isStreaming: true,
        uiParts: [],
      },
    ];

    render(<MessageList chatId="chat_newer_turn" messages={messages} isStreaming />);

    expect(screen.getAllByText("Arbetar med din sajt")).toHaveLength(1);
    const surfaces = screen.getAllByTestId("generation-surface");
    expect(surfaces[0].getAttribute("data-active")).toBe("false");
    expect(surfaces[1].getAttribute("data-active")).toBe("true");
  });

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
    // No blocking dialog exists anywhere in this component anymore (owner
    // beslut 2026-07-09: "Svar krävs" är alltid inline, aldrig en overlay).
    expect(screen.queryByRole("dialog")).toBeNull();
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

    // Rendered inline (no dialog) — the amber "Svar krävs" heading anchors
    // the question directly in the chat flow. (Matches twice: the inline
    // heading AND the floating scroll-to anchor button — both by design.)
    await waitFor(() => {
      expect(screen.getAllByText("Svar krävs").length).toBeGreaterThan(0);
    });

    expect(
      screen.getByText("Vad vill du att jag fokuserar på i nästa ändring?"),
    ).toBeTruthy();
    expect(
      screen.getByText("Svara i chatten för att fortsätta genereringen."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn förslag" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avvisa förslag" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends the selected quick reply from the inline awaiting-input block", async () => {
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

  it("renders a clear-redesign/scope question INLINE with clickable options (the exact path the modal used to own)", async () => {
    const onQuickReply = vi.fn(async () => {});
    const messages: ChatMessage[] = [
      {
        id: "assistant_scope",
        role: "assistant",
        content: "Din förfrågan låter som en större omgörning.",
        uiParts: [
          {
            type: "tool:awaiting-input",
            toolName: "Scope-fråga",
            toolCallId: "awaiting-input:assistant_scope",
            state: "input-available",
            output: {
              kind: "scope",
              question: "Hur vill du gå vidare med designen?",
              options: [
                "Förfina nuvarande design",
                "Gör en tydlig redesign i samma projekt",
                "Starta om från en ny grund",
              ],
              awaitingInput: true,
            },
          },
        ],
      },
    ];

    render(
      <MessageList chatId="chat_scope" messages={messages} onQuickReply={onQuickReply} />,
    );

    // All three options render inline; no dialog overlay exists.
    const redesignButton = await screen.findByRole("button", {
      name: "Gör en tydlig redesign i samma projekt",
    });
    expect(screen.getByRole("button", { name: "Förfina nuvarande design" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Starta om från en ny grund" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    // A11y: keyboard focus lands on the FIRST option when the question arrives
    // (replacement for the removed dialog focus-trap).
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Förfina nuvarande design" }),
      );
    });

    fireEvent.click(redesignButton);
    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Gör en tydlig redesign i samma projekt", {
        planMode: false,
      });
    });
  });

  it("propagates planMode: true for a plan-blocker pending question", async () => {
    const onQuickReply = vi.fn(async () => {});
    const messages: ChatMessage[] = [
      {
        id: "assistant_plan_blocker",
        role: "assistant",
        content: "Planen har blockerare som kräver svar.",
        uiParts: [
          {
            type: "tool:awaiting-input",
            toolName: "Planfråga",
            toolCallId: "awaiting-input:assistant_plan_blocker",
            state: "input-available",
            output: {
              question: "Vill du fortsätta trots blockeraren?",
              options: ["Ja, fortsätt", "Nej, avbryt"],
              planBlockers: ["Saknar betalleverantör"],
              awaitingInput: true,
            },
          },
        ],
      },
    ];

    render(
      <MessageList chatId="chat_plan" messages={messages} onQuickReply={onQuickReply} />,
    );

    const continueButton = await screen.findByRole("button", { name: "Ja, fortsätt" });
    fireEvent.click(continueButton);
    await waitFor(() => {
      expect(onQuickReply).toHaveBeenCalledWith("Ja, fortsätt", { planMode: true });
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

  it("renders an auto-repair prompt as a collapsed system row, never with the user's bubble style (Spår 03 Steg 4)", async () => {
    // The auto-repair prompt is still persisted as a "user" message (needed
    // for debugging and for every other engine_messages reader), but it
    // carries the additive `prompt-source` marker so the UI never presents
    // it as something the user typed.
    const messages: ChatMessage[] = [
      {
        id: "user_normal",
        role: "user",
        content: "Gör headern större.",
      },
      {
        id: "user_autofix_1",
        role: "user",
        content:
          "AUTO-FIX REQUEST — TARGETED REPAIR\n\nIssues detected: typecheck failed (exit 1).",
        uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "autofix" }],
      },
      {
        id: "assistant_autofix_1",
        role: "assistant",
        content: "Reparationen är klar.",
      },
    ];

    render(<MessageList chatId="chat_autofix" messages={messages} />);

    // A normal user prompt keeps its user bubble styling.
    const normalRow = screen.getByText("Gör headern större.").closest("[data-role]");
    expect(normalRow?.getAttribute("data-role")).toBe("user");

    // The repair prompt renders a collapsed status line, not the raw prompt.
    const repairLabel = await screen.findByText("Automatisk reparation kördes");
    expect(screen.queryByText(/Issues detected: typecheck failed/)).toBeNull();

    // ...and its row is a system row, never a user bubble.
    const repairRow = repairLabel.closest("[data-role]");
    expect(repairRow?.getAttribute("data-role")).toBe("system");
    expect(repairRow?.getAttribute("data-role")).not.toBe("user");

    // Expanding still surfaces the real prompt for debugging.
    fireEvent.click(
      screen.getByRole("button", { name: /Visa den tekniska instruktionen/ }),
    );
    expect(screen.getByText(/Issues detected: typecheck failed/)).toBeTruthy();
  });

  it("labels the original generation and the AUTO-FIX repair as two distinct cards", () => {
    const initFiles = [
      '```tsx file="app/page.tsx"\nexport default function Page() { return null; }\n```',
      '```tsx file="app/layout.tsx"\nexport default function Layout() { return null; }\n```',
      '```css file="app/a.css"\nbody {}\n```',
      '```css file="app/b.css"\nbody {}\n```',
      '```css file="app/c.css"\nbody {}\n```',
    ].join("\n");
    const messages: ChatMessage[] = [
      { id: "user_init", role: "user", content: "Bygg en sajt för bageriet." },
      {
        id: "assistant_init",
        role: "assistant",
        content: `Här är utkastet.\n${initFiles}`,
        uiParts: [
          {
            type: "tool:post-check",
            state: "output-available",
            output: {
              summary: {
                files: 5,
                added: 5,
                modified: 0,
                removed: 0,
                warnings: 0,
                provisional: true,
                qualityGatePending: false,
                autoFixQueued: true,
              },
            },
          },
        ],
      },
      {
        id: "user_autofix",
        role: "user",
        content: "AUTO-FIX REQUEST — TARGETED REPAIR\n\nIssues detected: typecheck failed (exit 1).",
        uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "autofix" }],
      },
      {
        id: "assistant_autofix",
        role: "assistant",
        content: '```css file="app/globals.css"\n:root { color: black; }\n```',
        uiParts: [
          {
            type: "tool-prompt-strategy",
            state: "output-available",
            output: {
              steps: [
                "Källa: Auto-repair (server-driven)",
                "Orsak: Auto-repair efter typecheck/quality-gate",
              ],
            },
          },
          {
            type: "tool:quality-gate",
            toolName: "Quality gate",
            state: "output-available",
            output: {
              passed: true,
              designAdvisory: true,
              checks: [
                { check: "typecheck", passed: false, advisory: true, exitCode: 1, output: "TS2322" },
              ],
            },
          },
        ],
      },
    ];

    render(<MessageList chatId="chat_repair_labels" messages={messages} />);

    const surfaces = screen.getAllByTestId("generation-surface");
    expect(surfaces).toHaveLength(2);

    expect(surfaces[0].getAttribute("data-turn-kind")).toBe("initial");
    expect(surfaces[0].getAttribute("data-attention")).toBe("false");
    expect(surfaces[0].getAttribute("data-repair-queued")).toBe("true");
    expect(within(surfaces[0]).getByText("Ursprunglig generering")).toBeTruthy();
    expect(
      within(surfaces[0]).getByText("5 filer i svaret. En automatisk reparation startade."),
    ).toBeTruthy();
    expect(within(surfaces[0]).getByText("5 filer i svaret")).toBeTruthy();

    expect(surfaces[1].getAttribute("data-turn-kind")).toBe("repair");
    expect(surfaces[1].getAttribute("data-attention")).toBe("true");
    expect(within(surfaces[1]).getByText("Automatisk reparation")).toBeTruthy();
    expect(
      within(surfaces[1]).getByText(
        "1 fil ändrad: app/globals.css. Orsak: Auto-repair efter typecheck/quality-gate. Se kontrollresultatet i detaljerna.",
      ),
    ).toBeTruthy();
    expect(within(surfaces[1]).getByText("1 fil ändrad")).toBeTruthy();
    expect(screen.queryByText("Kontroller att se över")).toBeNull();
  });

  it("still classifies a legacy AUTO-FIX REQUEST row as the repair turn", () => {
    render(
      <MessageList
        chatId="chat_legacy_autofix"
        messages={[
          { id: "user_init", role: "user", content: "Bygg sidan." },
          {
            id: "assistant_init",
            role: "assistant",
            content: '```tsx file="app/page.tsx"\nexport default function Page() { return null; }\n```',
          },
          {
            id: "user_legacy_fix",
            role: "user",
            content: "AUTO-FIX REQUEST — TARGETED REPAIR\n\nIssues detected: syntax.",
          },
          {
            id: "assistant_legacy_fix",
            role: "assistant",
            content: '```css file="app/globals.css"\n:root {}\n```',
          },
        ]}
      />,
    );
    const surfaces = screen.getAllByTestId("generation-surface");
    expect(surfaces[0].getAttribute("data-turn-kind")).toBe("initial");
    expect(surfaces[1].getAttribute("data-turn-kind")).toBe("repair");
    expect(within(surfaces[1]).getByText("Automatisk reparation")).toBeTruthy();
    expect(within(surfaces[1]).getByText("1 fil ändrad: app/globals.css.")).toBeTruthy();
  });

  it("labels the first code turn as the original generation", () => {
    render(
      <MessageList
        chatId="chat_first_code"
        messages={[
          { id: "user_1", role: "user", content: "Bygg en sajt för bageriet." },
          {
            id: "assistant_1",
            role: "assistant",
            content:
              '```tsx file="app/page.tsx"\nexport default function Page() { return null; }\n```',
          },
        ]}
      />,
    );
    const surface = screen.getByTestId("generation-surface");
    expect(surface.getAttribute("data-turn-kind")).toBe("initial");
    expect(within(surface).getByText("Ursprunglig generering")).toBeTruthy();
  });

  it("does not call a later user-led code turn the original generation", () => {
    render(
      <MessageList
        chatId="chat_followup_code"
        messages={[
          { id: "user_1", role: "user", content: "Bygg en sajt för bageriet." },
          {
            id: "assistant_1",
            role: "assistant",
            content:
              '```tsx file="app/page.tsx"\nexport default function Page() { return null; }\n```',
          },
          { id: "user_2", role: "user", content: "Gör hero-rubriken större." },
          {
            id: "assistant_2",
            role: "assistant",
            content:
              '```tsx file="app/page.tsx"\nexport default function Page() { return <h1>Större</h1>; }\n```',
          },
        ]}
      />,
    );
    const surfaces = screen.getAllByTestId("generation-surface");
    expect(surfaces[0].getAttribute("data-turn-kind")).toBe("initial");
    expect(within(surfaces[0]).getByText("Ursprunglig generering")).toBeTruthy();
    expect(surfaces[1].getAttribute("data-turn-kind")).toBe("followup");
    expect(within(surfaces[1]).getByText("Uppdatering av sajten")).toBeTruthy();
    expect(within(surfaces[1]).queryByText("Ursprunglig generering")).toBeNull();
  });

  it("still labels a repair after a follow-up as automatic repair", () => {
    render(
      <MessageList
        chatId="chat_followup_then_repair"
        messages={[
          { id: "user_1", role: "user", content: "Bygg en sajt." },
          {
            id: "assistant_1",
            role: "assistant",
            content:
              '```tsx file="app/page.tsx"\nexport default function Page() { return null; }\n```',
          },
          { id: "user_2", role: "user", content: "Gör hero-rubriken större." },
          {
            id: "assistant_2",
            role: "assistant",
            content:
              '```tsx file="app/page.tsx"\nexport default function Page() { return <h1>Större</h1>; }\n```',
          },
          {
            id: "user_fix",
            role: "user",
            content: "AUTO-FIX REQUEST — TARGETED REPAIR\n\nIssues detected: typecheck failed.",
            uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "autofix" }],
          },
          {
            id: "assistant_fix",
            role: "assistant",
            content: '```css file="app/globals.css"\n:root { color: black; }\n```',
          },
        ]}
      />,
    );
    const surfaces = screen.getAllByTestId("generation-surface");
    expect(surfaces).toHaveLength(3);
    expect(surfaces[1].getAttribute("data-turn-kind")).toBe("followup");
    expect(surfaces[2].getAttribute("data-turn-kind")).toBe("repair");
    expect(within(surfaces[2]).getByText("Automatisk reparation")).toBeTruthy();
    expect(within(surfaces[2]).getByText("1 fil ändrad: app/globals.css.")).toBeTruthy();
  });

  it("does not let an opening text-only assistant steal the original-generation label", () => {
    render(
      <MessageList
        chatId="chat_text_then_code"
        messages={[
          { id: "user_1", role: "user", content: "Bygg en sajt för bageriet." },
          {
            id: "assistant_ask",
            role: "assistant",
            content: "Vilken färg ska headern ha?",
          },
          { id: "user_2", role: "user", content: "Mörkblå." },
          {
            id: "assistant_code",
            role: "assistant",
            content:
              '```tsx file="app/page.tsx"\nexport default function Page() { return null; }\n```',
          },
        ]}
      />,
    );
    const surfaces = screen.getAllByTestId("generation-surface");
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0].getAttribute("data-turn-kind")).toBe("followup");
    expect(within(surfaces[0]).queryByText("Ursprunglig generering")).toBeNull();
    expect(surfaces[1].getAttribute("data-turn-kind")).toBe("initial");
    expect(within(surfaces[1]).getByText("Ursprunglig generering")).toBeTruthy();
  });

  it("renders a marked F3-kick prompt as a collapsed system row, never as a user bubble (M1)", async () => {
    const messages: ChatMessage[] = [
      {
        id: "user_normal",
        role: "user",
        content: "Gör headern större.",
      },
      {
        id: "user_f3_kick_marked",
        role: "user",
        content: "Bygg integrationer nu utifrån den finaliserade designversionen.",
        uiParts: [{ type: PROMPT_SOURCE_UI_PART_TYPE, sourceKind: "f3-kick" }],
      },
      {
        id: "assistant_f3_kick_1",
        role: "assistant",
        content: "Integrationsbygget är igång.",
      },
    ];

    render(<MessageList chatId="chat_f3_kick" messages={messages} />);

    const normalRow = screen.getByText("Gör headern större.").closest("[data-role]");
    expect(normalRow?.getAttribute("data-role")).toBe("user");

    const kickLabel = await screen.findByText(
      "Integrationsbygge startat utifrån den finaliserade designversionen.",
    );
    expect(
      screen.queryByText("Bygg integrationer nu utifrån den finaliserade designversionen."),
    ).toBeNull();

    const kickRow = kickLabel.closest("[data-role]");
    expect(kickRow?.getAttribute("data-role")).toBe("system");
    expect(kickRow?.getAttribute("data-role")).not.toBe("user");

    fireEvent.click(
      screen.getByRole("button", { name: /Visa den tekniska instruktionen/ }),
    );
    expect(
      screen.getByText("Bygg integrationer nu utifrån den finaliserade designversionen."),
    ).toBeTruthy();
  });

  it("renders a legacy F3-kick prompt (content prefix, no marker) as a system row", async () => {
    const messages: ChatMessage[] = [
      {
        id: "user_f3_kick_legacy",
        role: "user",
        content: "Bygg integrationer nu utifrån den finaliserade designversionen.",
      },
    ];

    render(<MessageList chatId="chat_f3_kick_legacy" messages={messages} />);

    const kickLabel = await screen.findByText(
      "Integrationsbygge startat utifrån den finaliserade designversionen.",
    );
    expect(kickLabel.closest("[data-role]")?.getAttribute("data-role")).toBe("system");
    expect(
      screen.queryByText("Bygg integrationer nu utifrån den finaliserade designversionen."),
    ).toBeNull();
  });

  it("leaves an ordinary user follow-up about integrationer as a user bubble", () => {
    const messages: ChatMessage[] = [
      {
        id: "user_freeform",
        role: "user",
        content: "Bygg integrationer nu.",
      },
    ];

    render(<MessageList chatId="chat_f3_freeform" messages={messages} />);

    const row = screen.getByText("Bygg integrationer nu.").closest("[data-role]");
    expect(row?.getAttribute("data-role")).toBe("user");
    expect(
      screen.queryByText("Integrationsbygge startat utifrån den finaliserade designversionen."),
    ).toBeNull();
  });

  it("shows Godkänn plan och bygg in the default chat, not only in felsökningsvyn", () => {
    const onApproveBuildPlan = vi.fn();
    const readyPlan = readyBuildPlan();

    render(
      <MessageList
        chatId="chat_sm088"
        showStructuredParts={false}
        onApproveBuildPlan={onApproveBuildPlan}
        messages={[
          {
            id: "assistant_plan_ready",
            role: "assistant",
            content: "Plan skapad (brochure): 2 sida/sidor och 0 integration(er) är redo för granskning.",
            uiParts: [
              {
                type: "plan",
                plan: {
                  title: "Brochure",
                  description: "Hem, Kontakt",
                  awaitingInput: false,
                  raw: readyPlan,
                },
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByTestId("generation-surface")).toBeTruthy();
    const approveButton = screen.getByRole("button", { name: "Godkänn plan och bygg" });
    fireEvent.click(approveButton);
    expect(onApproveBuildPlan).toHaveBeenCalledWith(readyPlan);
    expect(screen.queryByText("Quality gate")).toBeNull();
  });

  it("hides approval while canonical plan awaiting-input is active even if normalization drops its blocker", () => {
    const onApproveBuildPlan = vi.fn();
    const rawPlan = {
      ...readyBuildPlan(),
      blockers: [
        {
          id: "invalid-blocker",
          kind: "unsupported-kind",
          question: "Vilken datakälla ska användas?",
        },
      ],
    };

    render(
      <MessageList
        chatId="chat_sm088_pending"
        onApproveBuildPlan={onApproveBuildPlan}
        messages={[
          {
            id: "assistant_plan_pending",
            role: "assistant",
            content: "Planen kräver ett svar innan bygget kan starta.",
            uiParts: [
              {
                type: "plan",
                plan: {
                  title: "Brochure",
                  description: "Hem, Kontakt",
                  awaitingInput: true,
                  raw: rawPlan,
                },
              },
              {
                type: "tool:awaiting-input",
                toolName: "Plan: svar krävs",
                toolCallId: "awaiting-input:assistant_plan_pending",
                state: "input-available",
                output: {
                  question: "Vilken datakälla ska användas?",
                  awaitingInput: true,
                  planBlockers: rawPlan.blockers,
                },
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Bygg startsidan")).toBeTruthy();
    expect(screen.getByText("Vilken datakälla ska användas?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn plan och bygg" })).toBeNull();
    expect(onApproveBuildPlan).not.toHaveBeenCalled();
  });

  it.each([
    [
      "malformed",
      {
        id: "invalid-blocker",
        kind: "unsupported-kind",
        question: "Vilken datakälla ska användas?",
      },
    ],
    [
      "resolved",
      {
        id: "resolved-blocker",
        kind: "unclear",
        question: "Ska standardvalet användas?",
        resolved: true,
      },
    ],
  ])(
    "keeps approval hidden after reload when the persisted raw plan has a %s blocker",
    (_case, blocker) => {
      const onApproveBuildPlan = vi.fn();

      render(
        <MessageList
          chatId="chat_sm088_reloaded"
          onApproveBuildPlan={onApproveBuildPlan}
          messages={[
            {
              id: "assistant_reloaded_plan",
              role: "assistant",
              content: "Planen är sparad.",
              uiParts: [
                {
                  type: "plan",
                  plan: {
                    title: "Brochure",
                    description: "Hem, Kontakt",
                    awaitingInput: false,
                    raw: {
                      ...readyBuildPlan(),
                      blockers: [blocker],
                    },
                  },
                },
              ],
            },
          ]}
        />,
      );

      expect(screen.getByText("Bygg startsidan")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Godkänn plan och bygg" })).toBeNull();
      expect(onApproveBuildPlan).not.toHaveBeenCalled();
    },
  );

  it("keeps a legacy persisted plan without canonical approval state fail-closed", () => {
    const onApproveBuildPlan = vi.fn();

    render(
      <MessageList
        chatId="chat_sm088_legacy_reload"
        onApproveBuildPlan={onApproveBuildPlan}
        messages={[
          {
            id: "assistant_legacy_reloaded_plan",
            role: "assistant",
            content: "Planen är sparad.",
            uiParts: [
              {
                type: "plan",
                plan: {
                  title: "Brochure",
                  description: "Hem, Kontakt",
                  raw: readyBuildPlan(),
                },
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Bygg startsidan")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn plan och bygg" })).toBeNull();
    expect(onApproveBuildPlan).not.toHaveBeenCalled();
  });

  it.each([
    [true, false],
    [false, true],
  ])(
    "preserves canonical awaiting-input=%s through a persisted plan reload (approval visible: %s)",
    (hasBlockers, approvalVisible) => {
      const onApproveBuildPlan = vi.fn();
      const rawPlan = readyBuildPlan();
      const persistedAssistant = buildPlanModeAssistantMessage({
        planData: rawPlan,
        hasBlockers,
        hasPlanArtifact: true,
        plannerText: "",
        upstreamErrorMessage: hasBlockers ? "Provider stream failed" : null,
      });

      render(
        <MessageList
          chatId="chat_sm088_canonical_reload"
          onApproveBuildPlan={onApproveBuildPlan}
          messages={[
            {
              id: "assistant_canonical_reloaded_plan",
              role: "assistant",
              content: persistedAssistant.content,
              uiParts: persistedAssistant.uiParts,
            },
          ]}
        />,
      );

      expect(screen.getByText("Bygg startsidan")).toBeTruthy();
      const approveButton = screen.queryByRole("button", { name: "Godkänn plan och bygg" });
      expect(Boolean(approveButton)).toBe(approvalVisible);

      if (approveButton) {
        fireEvent.click(approveButton);
        expect(onApproveBuildPlan).toHaveBeenCalledWith(rawPlan);
      } else {
        expect(onApproveBuildPlan).not.toHaveBeenCalled();
      }
    },
  );

  it("keeps a historical plan visible without restoring its approval after a later turn", () => {
    const onApproveBuildPlan = vi.fn();

    render(
      <MessageList
        chatId="chat_sm088_history"
        onApproveBuildPlan={onApproveBuildPlan}
        messages={[
          {
            id: "assistant_old_plan",
            role: "assistant",
            content: "Planen är klar.",
            uiParts: [
              {
                type: "plan",
                plan: {
                  title: "Brochure",
                  description: "Hem, Kontakt",
                  awaitingInput: false,
                  raw: readyBuildPlan(),
                },
              },
            ],
          },
          { id: "user_after_plan", role: "user", content: "Byt målgrupp till företag." },
          { id: "assistant_after_plan", role: "assistant", content: "Målgruppen är uppdaterad." },
        ]}
      />,
    );

    expect(screen.getByText("Bygg startsidan")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn plan och bygg" })).toBeNull();
    expect(onApproveBuildPlan).not.toHaveBeenCalled();
  });

  it("keeps the interaction lock on the current ready-plan approval", () => {
    const onApproveBuildPlan = vi.fn();

    render(
      <MessageList
        chatId="chat_sm088_locked"
        onApproveBuildPlan={onApproveBuildPlan}
        quickReplyDisabled
        messages={[
          {
            id: "assistant_locked_plan",
            role: "assistant",
            content: "Planen är klar.",
            uiParts: [
              {
                type: "plan",
                plan: {
                  title: "Brochure",
                  description: "Hem, Kontakt",
                  awaitingInput: false,
                  raw: readyBuildPlan(),
                },
              },
            ],
          },
        ]}
      />,
    );

    const approveButton = screen.getByRole("button", { name: "Godkänn plan och bygg" });
    expect(approveButton.hasAttribute("disabled")).toBe(true);
    fireEvent.click(approveButton);
    expect(onApproveBuildPlan).not.toHaveBeenCalled();
  });
});
