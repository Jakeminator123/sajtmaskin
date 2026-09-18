import { afterEach, describe, expect, it, vi } from "vitest";

const emitWizardRouteTerminal = vi.hoisted(() => vi.fn());
const wizardRequestId = vi.hoisted(() => vi.fn(() => "req_test"));

vi.mock("@/lib/wizard/route-telemetry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./route-telemetry")>();
  return {
    ...actual,
    emitWizardRouteTerminal,
    wizardRequestId,
  };
});

const { withWizardRouteBudget } = await import("./route-budget");

afterEach(() => {
  vi.clearAllMocks();
});

describe("withWizardRouteBudget", () => {
  it("emits a terminal event after a successful response", async () => {
    const response = await withWizardRouteBudget(
      new Request("http://localhost/api/wizard/competitors"),
      { route: "competitors", maxDurationSeconds: 25 },
      async ({ stages, setOutcome, deadline }) => {
        stages.mark("validate");
        setOutcome("ok");
        expect(deadline.signal.aborted).toBe(false);
        return new Response("ok", { status: 200 });
      },
    );

    expect(response.status).toBe(200);
    expect(emitWizardRouteTerminal).toHaveBeenCalledTimes(1);
    expect(emitWizardRouteTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "competitors",
        outcome: "ok",
        requestId: "req_test",
        aborted: false,
      }),
    );
  });

  it("emits even when the handler throws", async () => {
    await expect(
      withWizardRouteBudget(
        new Request("http://localhost/api/wizard/enrich"),
        { route: "enrich", maxDurationSeconds: 30 },
        async ({ setOutcome }) => {
          setOutcome("error");
          throw new Error("llm down");
        },
      ),
    ).rejects.toThrow("llm down");

    expect(emitWizardRouteTerminal).toHaveBeenCalledTimes(1);
    expect(emitWizardRouteTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "enrich",
        outcome: "error",
        requestId: "req_test",
      }),
    );
  });
});
