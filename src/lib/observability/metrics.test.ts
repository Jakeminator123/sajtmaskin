import { beforeEach, describe, expect, it } from "vitest";
import {
  OBSERVED_PHASES,
  getPrometheusMetrics,
  incEarlyStop,
  incFixerCall,
  incPartialFileRepair,
  incVerifierBlocking,
  recordPhaseDuration,
  register,
  resetMetricsForTest,
} from "./metrics";

type PromCounterLike = {
  get(): Promise<{
    values: Array<{ labels: Record<string, string>; value: number }>;
  }>;
};

async function getCounterValues(
  name: string,
): Promise<Array<{ labels: Record<string, string>; value: number }>> {
  const metric = register.getSingleMetric(name) as unknown as
    | PromCounterLike
    | undefined;
  expect(metric, `metric ${name} should be registered`).toBeDefined();
  const snapshot = await metric!.get();
  return snapshot.values;
}

describe("observability/metrics", () => {
  beforeEach(() => {
    resetMetricsForTest();
  });

  it("includes the canonical phase set without pre_vm_typecheck", () => {
    expect(OBSERVED_PHASES).toContain("validate_syntax");
    expect(OBSERVED_PHASES).toContain("repair_loop");
    expect(OBSERVED_PHASES).not.toContain("pre_vm_typecheck");
  });

  it("records phase duration with the phase label", async () => {
    recordPhaseDuration("validate_syntax", 1234);
    const text = await getPrometheusMetrics();
    expect(text).toContain("sajtmaskin_phase_duration_ms");
    expect(text).toMatch(/phase="validate_syntax"/);
  });

  it("counts fixer calls partitioned by fixer + outcome", async () => {
    incFixerCall("react-import-fixer", "applied");
    incFixerCall("react-import-fixer", "applied");
    incFixerCall("react-import-fixer", "noop");

    const text = await getPrometheusMetrics();
    expect(text).toContain("sajtmaskin_fixer_call_total");
    expect(text).toMatch(
      /sajtmaskin_fixer_call_total\{[^}]*fixer="react-import-fixer"[^}]*outcome="applied"[^}]*\}\s+2/,
    );
    expect(text).toMatch(
      /sajtmaskin_fixer_call_total\{[^}]*outcome="noop"[^}]*\}\s+1/,
    );
  });

  it("defaults fixer outcome to 'applied' when omitted", async () => {
    incFixerCall("dep-completer");
    const values = await getCounterValues("sajtmaskin_fixer_call_total");
    const match = values.find(
      (v) => v.labels.fixer === "dep-completer" && v.labels.outcome === "applied",
    );
    expect(match?.value).toBe(1);
  });

  it("records blocking verifier findings by finding_id", async () => {
    incVerifierBlocking("navigation-placeholder-actions");
    const text = await getPrometheusMetrics();
    expect(text).toContain("sajtmaskin_verifier_blocking_total");
    expect(text).toMatch(/finding_id="navigation-placeholder-actions"/);
  });

  it("records partial-file-repair outcomes for both success and fail", async () => {
    incPartialFileRepair("success");
    incPartialFileRepair("fail");

    const text = await getPrometheusMetrics();
    expect(text).toContain("sajtmaskin_partial_file_repair_total");
    expect(text).toMatch(/outcome="success"/);
    expect(text).toMatch(/outcome="fail"/);
  });

  it("records early-stop signals with reason + phase labels", async () => {
    incEarlyStop("fixer_noop", "validate_syntax");
    const text = await getPrometheusMetrics();
    expect(text).toContain("sajtmaskin_early_stop_total");
    expect(text).toMatch(
      /sajtmaskin_early_stop_total\{[^}]*reason="fixer_noop"[^}]*phase="validate_syntax"[^}]*\}\s+1/,
    );
  });

  it("resets custom counters back to zero via resetMetricsForTest", async () => {
    incFixerCall("react-import-fixer", "applied");
    let values = await getCounterValues("sajtmaskin_fixer_call_total");
    expect(values.find((v) => v.labels.fixer === "react-import-fixer")?.value).toBe(1);

    resetMetricsForTest();

    values = await getCounterValues("sajtmaskin_fixer_call_total");
    const after = values.find((v) => v.labels.fixer === "react-import-fixer");
    // After reset the label combination is no longer present (or value is 0).
    expect(after?.value ?? 0).toBe(0);
  });

  it("caches the registry on globalThis so dev hot-reload reuses the singleton", () => {
    const cached = (
      globalThis as unknown as {
        __sajtmaskinMetricsRegistry?: { register: unknown };
      }
    ).__sajtmaskinMetricsRegistry;
    expect(cached).toBeDefined();
    expect(cached?.register).toBe(register);
  });
});
