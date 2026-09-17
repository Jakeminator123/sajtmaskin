import { afterEach, describe, expect, it } from "vitest";

import {
  WIZARD_COMPETITORS_MAX_DURATION_S,
  WIZARD_ENRICH_MAX_DURATION_S,
  WIZARD_ROUTE_ABORT_HEADROOM_MS,
  createWizardRouteDeadline,
  isWizardAbortError,
  raceWizardDeadline,
} from "./route-deadline";

const pending: Array<ReturnType<typeof createWizardRouteDeadline>> = [];

afterEach(() => {
  for (const deadline of pending) deadline.dispose();
  pending.length = 0;
});

describe("wizard route deadline", () => {
  it("keeps the published route budgets and aborts before the Vercel kill", () => {
    const competitors = createWizardRouteDeadline(WIZARD_COMPETITORS_MAX_DURATION_S);
    const enrich = createWizardRouteDeadline(WIZARD_ENRICH_MAX_DURATION_S);
    pending.push(competitors, enrich);

    expect(WIZARD_COMPETITORS_MAX_DURATION_S).toBe(25);
    expect(WIZARD_ENRICH_MAX_DURATION_S).toBe(30);
    expect(WIZARD_ROUTE_ABORT_HEADROOM_MS).toBe(2_000);
    expect(competitors.budgetMs).toBe(25_000);
    expect(competitors.abortAtMs).toBe(23_000);
    expect(enrich.budgetMs).toBe(30_000);
    expect(enrich.abortAtMs).toBe(28_000);
    expect(competitors.signal.aborted).toBe(false);
  });

  it("aborts after the remaining budget and not after dispose", async () => {
    const live = createWizardRouteDeadline(1, { abortHeadroomMs: 990 });
    pending.push(live);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(live.signal.aborted).toBe(true);

    const stopped = createWizardRouteDeadline(1, { abortHeadroomMs: 990 });
    stopped.dispose();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(stopped.signal.aborted).toBe(false);
  });

  it("follows an already-aborted parent signal", () => {
    const parent = new AbortController();
    parent.abort();
    const deadline = createWizardRouteDeadline(25, { signal: parent.signal });
    pending.push(deadline);
    expect(deadline.signal.aborted).toBe(true);
  });

  it("rejects hanging work when the deadline fires", async () => {
    const deadline = createWizardRouteDeadline(1, { abortHeadroomMs: 990 });
    pending.push(deadline);

    await expect(
      raceWizardDeadline(
        deadline.signal,
        () => new Promise<string>(() => {}),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("classifies AbortError and an already-aborted signal", () => {
    const deadline = createWizardRouteDeadline(25);
    pending.push(deadline);
    expect(isWizardAbortError(new DOMException("The operation was aborted.", "AbortError"))).toBe(
      true,
    );
    expect(isWizardAbortError(new Error("boom"))).toBe(false);

    const aborted = new AbortController();
    aborted.abort();
    expect(isWizardAbortError(new Error("unrelated"), aborted.signal)).toBe(true);
  });
});
