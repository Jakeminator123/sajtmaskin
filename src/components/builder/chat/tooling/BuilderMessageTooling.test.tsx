import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AgentLogCard,
  buildAgentLogItems,
  CompactToolParts,
  getActiveAgentLogLabel,
  isActionableToolPart,
  StructuredToolParts,
} from "../../BuilderMessageTooling";

describe("StructuredToolParts", () => {
  it("shows the current measured activity while work is running and collapses when done", async () => {
    const items = [
      { label: "Startar own-engine-strömmen" },
      { label: "Validerar genererad kod" },
    ];
    const { rerender } = render(
      <AgentLogCard
        items={items}
        activeLabel="Validerar genererad kod"
        isActive
      />,
    );

    expect(screen.getByText("Arbetar med din sajt")).toBeTruthy();
    expect(screen.getAllByText("Validerar genererad kod").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pågår")).toBeTruthy();

    rerender(<AgentLogCard items={items} isActive={false} />);

    await waitFor(() => {
      expect(screen.getByText("Slutsteg (2)")).toBeTruthy();
      expect(screen.queryByText("Pågår")).toBeNull();
    });
  });

  it("shows an honest pre-stream activity before the first SSE event arrives", () => {
    render(<AgentLogCard items={[]} isActive />);

    expect(screen.getByText("Arbetar med din sajt")).toBeTruthy();
    expect(
      screen.getAllByText("Förbereder byggunderlag och startar own-engine.").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("uses a neutral handoff status between measured phases instead of repeating pre-stream copy", () => {
    render(
      <AgentLogCard
        items={[{ label: "Generering klar — startar efterkontroller och slutsteg" }]}
        isActive
      />,
    );

    expect(
      screen.getAllByText("Fortsätter med nästa byggsteg.").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByText("Förbereder byggunderlag och startar own-engine."),
    ).toBeNull();
  });

  it("keeps the elapsed timer across the handoff from stream to post-check work", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00Z"));
    try {
      const items = [{ label: "Genererar innehåll och filer från prompten" }];
      const { rerender } = render(
        <AgentLogCard
          items={items}
          activeLabel="Genererar innehåll och filer från prompten"
          isActive
        />,
      );

      act(() => vi.advanceTimersByTime(2_100));
      expect(screen.getByText("2s")).toBeTruthy();

      rerender(<AgentLogCard items={items} isActive={false} />);
      act(() => vi.advanceTimersByTime(5_000));
      rerender(
        <AgentLogCard
          items={items}
          activeLabel="RenderGate • Förbereder"
          isActive
        />,
      );
      act(() => vi.advanceTimersByTime(1_000));

      expect(screen.getByText("8s")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves the latest input-streaming tool step as current activity", () => {
    expect(
      getActiveAgentLogLabel([
        {
          type: "tool",
          tool: {
            type: "tool:engine-generation",
            state: "output-available",
            output: { steps: ["Generering klar"] },
          },
        } as never,
        {
          type: "tool",
          tool: {
            type: "tool:engine-autofix",
            state: "input-streaming",
            output: {
              steps: ["Startar mekanisk autofix", "Kontrollerar importer"],
            },
          },
        } as never,
      ]),
    ).toBe("Kontrollerar importer");
  });

  it("uses the same pending label for an empty streaming tool in header and log", () => {
    const toolParts = [
      {
        type: "tool",
        tool: {
          type: "tool:quality-gate",
          toolName: "Quality gate",
          state: "input-streaming",
        },
      } as never,
    ];

    expect(getActiveAgentLogLabel(toolParts)).toBe("Quality gate • Förbereder");
    expect(buildAgentLogItems(toolParts)).toEqual([
      { label: "Quality gate • Förbereder" },
    ]);
  });

  it("marks a failed tool so the log never stamps an error as done", () => {
    expect(
      buildAgentLogItems([
        {
          type: "tool",
          tool: {
            type: "tool:engine-preview",
            toolName: "Preview",
            state: "output-error",
          },
        } as never,
      ]),
    ).toEqual([{ label: "Preview • Fel", failed: true }]);

    expect(
      buildAgentLogItems([
        {
          type: "tool",
          tool: {
            type: "tool:engine-preview",
            toolName: "Preview",
            state: "output-error",
            output: { steps: ["Startar preview", "Bygget misslyckades"] },
          },
        } as never,
      ]),
    ).toEqual([
      { label: "Startar preview" },
      { label: "Bygget misslyckades", failed: true },
    ]);
  });

  it("renders a warning icon instead of a checkmark for a failed step", () => {
    render(
      <AgentLogCard
        items={[{ label: "Bygget misslyckades", failed: true }]}
        activeLabel="Försöker igen"
        isActive
      />,
    );

    expect(screen.getByLabelText("Steget misslyckades")).toBeTruthy();
  });

  it("keeps failure status visible in the collapsed completed header", () => {
    render(
      <AgentLogCard
        items={[{ label: "Preview kunde inte starta", failed: true }]}
        isActive={false}
      />,
    );

    expect(screen.getByLabelText("Ett byggsteg misslyckades")).toBeTruthy();
    expect(screen.getByText("Slutsteg (1) · fel")).toBeTruthy();
    expect(screen.getByText("Fel upptäcktes — visa detaljer")).toBeTruthy();
  });

  it("does not stamp Slutsteg as fel for an advisory verifier fix-failed", () => {
    const items = buildAgentLogItems([
      {
        type: "tool",
        tool: {
          type: "tool:engine-verifier",
          toolName: "Verifiering",
          state: "output-available",
          output: {
            step: "verifier",
            phase: "fix-failed",
            severity: "advisory",
            steps: ["Verifieringen kunde inte laga fyndet"],
          },
        },
      } as never,
    ]);

    expect(items.some((item) => item.failed)).toBe(false);

    render(<AgentLogCard items={items} isActive={false} />);

    expect(screen.getByText("Slutsteg (1)")).toBeTruthy();
    expect(screen.queryByText("Slutsteg (1) · fel")).toBeNull();
    expect(screen.queryByLabelText("Ett byggsteg misslyckades")).toBeNull();
  });

  it("keeps Slutsteg · fel for a blocking verifier fix-failed", () => {
    const items = buildAgentLogItems([
      {
        type: "tool",
        tool: {
          type: "tool:engine-verifier",
          toolName: "Verifiering",
          state: "output-error",
          output: {
            step: "verifier",
            phase: "fix-failed",
            severity: "blocking",
            steps: ["Verifieringen kunde inte laga fyndet"],
          },
        },
      } as never,
    ]);

    expect(items.some((item) => item.failed)).toBe(true);

    render(<AgentLogCard items={items} isActive={false} />);

    expect(screen.getByText("Slutsteg (1) · fel")).toBeTruthy();
    expect(screen.getByLabelText("Ett byggsteg misslyckades")).toBeTruthy();
  });

  it("keeps an earlier failure visible while a later post-check is active", () => {
    render(
      <AgentLogCard
        items={[
          { label: "Preview kunde inte starta", failed: true },
          { label: "Efterkontrollerar filer och preview" },
        ]}
        activeLabel="Efterkontrollerar filer och preview"
        isActive
      />,
    );

    expect(screen.getByText("Arbetar vidare efter fel")).toBeTruthy();
    expect(screen.getByLabelText("Ett byggsteg misslyckades")).toBeTruthy();
    expect(
      screen.getAllByText("Efterkontrollerar filer och preview").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("ignores stale pipeline progress after the message stream ends but keeps client post-checks", () => {
    const staleGeneration = {
      type: "tool",
      tool: {
        type: "tool:engine-generation",
        toolName: "Generering",
        state: "input-streaming",
        output: { steps: ["Genererar innehåll och filer från prompten"] },
      },
    } as never;
    const activeQualityGate = {
      type: "tool",
      tool: {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        state: "input-streaming",
      },
    } as never;

    expect(
      getActiveAgentLogLabel([staleGeneration], {
        includePipelineProgress: false,
      }),
    ).toBeNull();
    expect(
      getActiveAgentLogLabel([staleGeneration, activeQualityGate], {
        includePipelineProgress: false,
      }),
    ).toBe("Quality gate • Förbereder");
  });

  it("extracts detailed server-repair steps for the agent log", () => {
    expect(
      buildAgentLogItems([
        {
          type: "tool",
          tool: {
            type: "tool:quality-gate",
            name: "Server repair",
            state: "output-available",
            output: {
              repaired: false,
              method: "llm",
              remainingErrors: 3,
              improvedSyntax: true,
              earlyStopReason: "no_improvement",
            },
          },
        } as never,
      ]),
    ).toEqual([
      { label: "Server repair blev inte fullständig." },
      { label: "Metod: llm" },
      { label: "Kvarvarande fel: 3" },
      { label: "Syntax förbättrades: ja" },
      { label: "Stopporsak: no_improvement" },
    ]);
  });

  it("keeps clarification prompts as free-text questions when no approval intent exists", () => {
    render(
      <StructuredToolParts
        messageId="msg_1"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:question",
              state: "input-available",
              input: {
                question: "Vilket domännamn vill du använda för sajten?",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("Vilket domännamn vill du använda för sajten?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn förslag" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avvisa förslag" })).toBeNull();
  });

  it("adds synthetic approval options only for actual approval flows", () => {
    render(
      <StructuredToolParts
        messageId="msg_2"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:approval",
              state: "approval-requested",
              input: {
                question: "Godkänner du planen innan jag fortsätter?",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByRole("button", { name: "Godkänn förslag" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avvisa förslag" })).toBeTruthy();
  });

  it("keeps awaiting-input clarifying questions as free-text prompts without synthetic approval buttons", () => {
    render(
      <StructuredToolParts
        messageId="msg_awaiting"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:awaiting-input",
              state: "input-available",
              output: {
                question: "Vad vill du att jag fokuserar på i nästa ändring?",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={vi.fn(async () => true)}
      />,
    );

    expect(
      screen.getByText("Vad vill du att jag fokuserar på i nästa ändring?"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn förslag" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avvisa förslag" })).toBeNull();
  });

  it("points integration setup copy at Byggblock, not the removed Integrationspanel", () => {
    render(
      <CompactToolParts
        messageId="msg_integration_byggblock_copy"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:integration-suggestion",
              state: "output-available",
              output: {},
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(
      screen.getByText(
        /Den genererade sajten behöver denna integration\. Konfigurera via miljövariabler eller Byggblock i previewen\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Integrationspanelen/)).toBeNull();
  });

  it("never renders 'Integration: Integration' when provider metadata exists", () => {
    render(
      <CompactToolParts
        messageId="msg_integration_generic_name"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:integration-suggestion",
              state: "output-available",
              output: {
                name: "Integration",
                provider: "stripe",
                envVars: ["STRIPE_SECRET_KEY"],
                status: "Kräver konfiguration",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Integration: Stripe")).toBeTruthy();
    expect(screen.queryByText("Integration: Integration")).toBeNull();
  });

  it("suppresses its own quick-reply buttons while ANY pendingReply exists (Codex P1 på #482)", () => {
    // A quick action sends a plain user message, and the pending gate
    // consumes the NEXT user message as its answer
    // (`collectFollowUpClarificationAnswer`) — clicking an unrelated card
    // button while a clarification waits would silently mis-answer the
    // gate. The inline block at the list bottom owns the pending
    // interaction; every card's quick actions stay hidden until it is
    // answered.
    const onQuickReply = vi.fn(async () => true);
    render(
      <CompactToolParts
        messageId="msg_guard_regression"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:integration-suggestion",
              toolName: "Integration suggestion",
              toolCallId: "integration:stripe_guard",
              state: "approval-requested",
              output: {
                question: "Vill du konfigurera Stripe nu?",
                options: ["Godkänn förslag", "Avvisa förslag"],
                provider: "stripe",
                name: "Stripe",
              },
            },
          } as never,
        ]}
        pendingReply={{
          key: "other_message:0:Some other question",
          messageId: "other_message",
          question: "Some other question",
          options: ["Ja", "Nej"],
        }}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={onQuickReply}
      />,
    );

    expect(screen.queryByRole("button", { name: "Godkänn förslag" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avvisa förslag" })).toBeNull();
  });

  it("fires quick-reply as usual when no pendingReply exists", () => {
    const onQuickReply = vi.fn(async () => true);
    render(
      <CompactToolParts
        messageId="msg_guard_regression_2"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:integration-suggestion",
              toolName: "Integration suggestion",
              toolCallId: "integration:stripe_guard_2",
              state: "approval-requested",
              output: {
                question: "Vill du konfigurera Stripe nu?",
                options: ["Godkänn förslag", "Avvisa förslag"],
                provider: "stripe",
                name: "Stripe",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={onQuickReply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Godkänn förslag" }));
    expect(onQuickReply).toHaveBeenCalledWith(
      "msg_guard_regression_2",
      0,
      "Godkänn förslag",
      { planMode: false },
    );
  });

  it("keeps integration/env tool parts actionable in compact mode", () => {
    // Ägarbeslut 2026-07-03: integrations- och env-frågor ska fortsätta
    // visas inline i chatten (compact cards), inte flyttas till plan-dialogen.
    expect(
      isActionableToolPart({
        type: "tool:integration-suggestion",
        state: "output-available",
        toolName: "Integration suggestion",
      } as never),
    ).toBe(true);
    expect(
      isActionableToolPart({
        type: "tool:added-environment-variables",
        state: "output-available",
        toolName: "Added environment variables",
      } as never),
    ).toBe(true);
  });

  it("shows quality-gate pending separately from queued autofix work", () => {
    render(
      <StructuredToolParts
        messageId="msg_3"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:post-check",
              state: "output-available",
              output: {
                summary: {
                  files: 3,
                  added: 1,
                  modified: 2,
                  removed: 0,
                  warnings: 0,
                  provisional: true,
                  qualityGatePending: true,
                  autoFixQueued: false,
                },
                demoUrl: "https://preview.example",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Status: quality gate körs fortfarande")).toBeTruthy();
    expect(screen.queryByText(/autofix är köad/i)).toBeNull();
  });

  it("shows verify-lane metadata such as first failure check", () => {
    render(
      <StructuredToolParts
        messageId="msg_quality_gate"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:quality-gate",
              state: "output-available",
              output: {
                passed: false,
                checks: [
                  {
                    check: "install",
                    passed: false,
                    exitCode: 1,
                    output: "npm install failed",
                    durationMs: 1850,
                  },
                ],
                verifyLaneDurationMs: 3200,
                firstFailureCheck: "install",
                jobStartedAt: "2026-04-03T12:00:00.000Z",
                jobFinishedAt: "2026-04-03T12:00:03.200Z",
                visualQA: {
                  overallScore: 74,
                  passed: false,
                  checks: [
                    {
                      check: "hero-balance",
                      passed: false,
                      score: 74,
                      detail: "Hero layout feels uneven.",
                    },
                  ],
                },
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Första fel: install")).toBeTruthy();
    expect(screen.getByText("1.9s")).toBeTruthy();
    expect(screen.getByText("Total: 3.2s")).toBeTruthy();
    expect(screen.getByText("Start: 12:00:00Z • Slut: 12:00:03Z")).toBeTruthy();
    expect(screen.getByText("Visuell QA: 74/100 Under tröskel")).toBeTruthy();
  });

  it("renders F3 lint warnings as an amber advisory instead of solid green", () => {
    render(
      <StructuredToolParts
        messageId="msg_quality_gate_lint_advisory"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:quality-gate",
              state: "output-available",
              output: {
                passed: true,
                qualityGateAdvisory: true,
                advisoryChecks: ["lint"],
                checks: [
                  {
                    check: "lint",
                    passed: true,
                    advisory: true,
                    exitCode: 0,
                    output: "2 warnings",
                    durationMs: 400,
                  },
                ],
                verifyLaneDurationMs: 400,
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Godkänd med varningar (lint advisory)")).toBeTruthy();
    expect(screen.queryByText(/^Godkänd$/)).toBeNull();
  });

  it("shows compact verify-lane summary without structured tool cards", () => {
    render(
      <CompactToolParts
        messageId="msg_quality_gate_compact"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:quality-gate",
              state: "output-available",
              output: {
                passed: false,
                checks: [
                  {
                    check: "build",
                    passed: false,
                    exitCode: 1,
                    output: "Build failed: missing export",
                    durationMs: 1800,
                  },
                ],
                verifyLaneDurationMs: 3200,
                firstFailureCheck: "build",
                jobStartedAt: "2026-04-03T12:00:00.000Z",
                jobFinishedAt: "2026-04-03T12:00:03.200Z",
                visualQA: {
                  overallScore: 74,
                  passed: false,
                  checks: [
                    {
                      check: "hero-balance",
                      passed: false,
                      score: 74,
                      detail: "Hero layout feels uneven.",
                    },
                  ],
                },
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Verifiering: Underkänd")).toBeTruthy();
    expect(screen.getByText("build (1.8s)")).toBeTruthy();
    expect(screen.getByText("Detalj: Build failed: missing export")).toBeTruthy();
    expect(screen.getByText("Total: 3.2s • Första fel: build")).toBeTruthy();
    expect(screen.getByText("Start: 12:00:00Z • Slut: 12:00:03Z")).toBeTruthy();
    expect(screen.getByText("Visuell QA: 74/100 Under tröskel")).toBeTruthy();
  });

  it("shows compact skipped quality gate reason", () => {
    render(
      <CompactToolParts
        messageId="msg_quality_gate_skipped"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:quality-gate",
              state: "output-available",
              output: {
                skipped: true,
                reason: "Quality gate not configured",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Verifiering: hoppades över")).toBeTruthy();
    expect(screen.getByText("Quality gate not configured")).toBeTruthy();
  });

  it("shows compact quality gate error text", () => {
    render(
      <CompactToolParts
        messageId="msg_quality_gate_error"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:quality-gate",
              state: "output-error",
              errorText: "Quality gate request failed (network error)",
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Verifiering: fel")).toBeTruthy();
    expect(screen.getByText("Quality gate request failed (network error)")).toBeTruthy();
  });

  it("shows structured server-repair summary", () => {
    render(
      <StructuredToolParts
        messageId="msg_server_repair"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:quality-gate",
              name: "Server repair",
              state: "output-available",
              output: {
                repaired: false,
                status: "completed",
                method: "llm",
                remainingErrors: 3,
                improvedSyntax: true,
                earlyStopReason: "no_improvement",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getAllByText("Server repair").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Reparationsförsök slutfört utan full fix")).toBeTruthy();
    expect(screen.getAllByText("Status: completed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Metod: llm")).toBeTruthy();
    expect(screen.getByText("Kvarvarande fel: 3")).toBeTruthy();
    expect(screen.getByText("Syntax förbättrades: ja")).toBeTruthy();
    expect(screen.getByText("Stopporsak: no_improvement")).toBeTruthy();
  });

  it("shows compact server-repair summary", () => {
    render(
      <CompactToolParts
        messageId="msg_server_repair_compact"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:quality-gate",
              name: "Server repair",
              state: "output-available",
              output: {
                repaired: false,
                status: "completed",
                method: "llm",
                remainingErrors: 3,
                improvedSyntax: true,
                earlyStopReason: "no_improvement",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Reparation: ej fullständig")).toBeTruthy();
    expect(screen.getAllByText("Status: completed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Metod: llm")).toBeTruthy();
    expect(
      screen.getByText("Kvarvarande fel: 3 • Syntax förbättrades: ja • Stopporsak: no_improvement"),
    ).toBeTruthy();
  });

  it("shows server-repair reason when the request fails before a repair result exists", () => {
    render(
      <CompactToolParts
        messageId="msg_server_repair_request_failed"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:quality-gate",
              name: "Server repair",
              state: "output-available",
              output: {
                repaired: false,
                status: "request_failed",
                reason: "Repair request failed (HTTP 500)",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Reparation: ej fullständig")).toBeTruthy();
    expect(screen.getAllByText("Status: request_failed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Orsak: Repair request failed (HTTP 500)")).toBeTruthy();
  });

  it("renders no SEO/analytics/editorial/business review panels even when legacy output carries the summaries", () => {
    // 2026-07-23 declutter: old versions can still have these summary fields
    // persisted in tool output — the UI must ignore them silently.
    render(
      <StructuredToolParts
        messageId="msg_4"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:post-check",
              state: "output-available",
              output: {
                summary: {
                  files: 4,
                  added: 1,
                  modified: 3,
                  removed: 0,
                  warnings: 0,
                  provisional: false,
                  qualityGatePending: false,
                  autoFixQueued: false,
                },
                demoUrl: "https://preview.example",
                seoSummary: {
                  passed: false,
                  issueCount: 3,
                  topIssues: ["Metadata saknar canonical-strategi."],
                  suggestedPrompts: ["Fyll ut metadata för sajten."],
                  suggestedLabels: ["metadata"],
                  canonical: false,
                  ogImage: false,
                  homeH1Count: 1,
                },
                businessWorkflowSummary: {
                  packCount: 1,
                  labels: ["Lead form + email routing"],
                  suggestedPrompts: ["Gör leadformuläret produktionsredo."],
                  recommendedIntegrations: ["Resend"],
                  hasLeadCapture: true,
                  hasBookingFlow: false,
                  hasCrmSync: false,
                },
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={vi.fn(async () => true)}
      />,
    );

    expect(screen.queryByText("Snabb SEO-fix")).toBeNull();
    expect(screen.queryByText(/SEO-tips/)).toBeNull();
    expect(screen.queryByText("Snabb konfigurering")).toBeNull();
    expect(screen.queryByText("Snabb tracking-fix")).toBeNull();
  });
});
