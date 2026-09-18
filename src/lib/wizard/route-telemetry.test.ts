import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WIZARD_ROUTE_TERMINAL_EVENT,
  createWizardStageClock,
  emitWizardRouteTerminal,
  wizardRequestId,
} from "./route-telemetry";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("wizard route telemetry", () => {
  it("picks the longest named stage as dominant", () => {
    let now = 0;
    const stages = createWizardStageClock(() => now);
    stages.mark("validate");
    now += 5;
    stages.mark("search");
    now += 20;
    stages.mark("llm");
    now += 400;
    stages.mark("respond");
    now += 2;

    expect(stages.dominant()).toBe("llm");
    expect(stages.durationsMs().llm).toBe(400);
  });

  it("falls back to validate when no stage has elapsed", () => {
    const stages = createWizardStageClock(() => 0);
    expect(stages.dominant()).toBe("validate");
  });

  it("emits a content-free JSON terminal event", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const payload = emitWizardRouteTerminal({
      route: "enrich",
      outcome: "deadline",
      dominantStage: "scrape",
      durationMs: 28112.6,
      requestId: "cdg1::abc",
      aborted: true,
      companyName: "Hemligt AB",
      prompt: "lista konkurrenter",
    } as Parameters<typeof emitWizardRouteTerminal>[0] & {
      companyName: string;
      prompt: string;
    });

    expect(payload).toEqual({
      event: WIZARD_ROUTE_TERMINAL_EVENT,
      route: "enrich",
      outcome: "deadline",
      dominantStage: "scrape",
      durationMs: 28113,
      requestId: "cdg1::abc",
      aborted: true,
    });
    expect(Object.keys(payload).sort()).toEqual([
      "aborted",
      "dominantStage",
      "durationMs",
      "event",
      "outcome",
      "requestId",
      "route",
    ]);
    expect(info).toHaveBeenCalledWith(JSON.stringify(payload));
    const line = String(info.mock.calls[0]?.[0] ?? "");
    expect(line).not.toContain("Hemligt");
    expect(line).not.toContain("companyName");
    expect(line).not.toContain("prompt");
    expect(line).not.toContain("lista konkurrenter");
  });

  it("reads only request-id headers", () => {
    const req = new Request("http://localhost/api/wizard/enrich", {
      headers: {
        "x-vercel-id": "iad1::req_1",
        "x-company": "should-not-be-used",
      },
    });
    expect(wizardRequestId(req)).toBe("iad1::req_1");
  });
});
