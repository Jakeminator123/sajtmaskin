import { describe, expect, it } from "vitest";

import {
  decideRollout,
  type DecideRolloutInput,
  type RolloutDecision,
} from "./rollout-policy";

function input(overrides: Partial<DecideRolloutInput> = {}): DecideRolloutInput {
  return {
    killSwitch: false,
    requestedLane: "classic",
    cohort: "internal_f2",
    openCohorts: ["internal_f2"],
    optIn: false,
    ...overrides,
  };
}

describe("decideRollout", () => {
  it("treats a missing or non-false kill switch as kill_switch", () => {
    expect(
      decideRollout({
        ...input({ requestedLane: "openclaw_shadow", optIn: true }),
        killSwitch: undefined as unknown as boolean,
      }),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "kill_switch",
    });
    expect(
      decideRollout({
        ...input({ requestedLane: "openclaw_shadow", optIn: true }),
        killSwitch: "false" as unknown as boolean,
      }),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "kill_switch",
    });
  });

  it("lets the kill switch win over every other input", () => {
    expect(decideRollout(input({ killSwitch: true }))).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "kill_switch",
    });
    expect(
      decideRollout(
        input({
          killSwitch: true,
          requestedLane: "openclaw_shadow",
          optIn: true,
          openCohorts: ["internal_f2"],
        }),
      ),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "kill_switch",
    });
    expect(
      decideRollout(
        input({
          killSwitch: true,
          requestedLane: "openclaw_candidate",
          optIn: true,
          openCohorts: ["internal_f2"],
        }),
      ),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "kill_switch",
    });
    expect(
      decideRollout(
        input({
          killSwitch: true,
          requestedLane: "not-a-lane",
          optIn: true,
        }),
      ),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "kill_switch",
    });
  });

  it("keeps classic when the requested OpenClaw cohort is closed", () => {
    expect(
      decideRollout(
        input({
          requestedLane: "openclaw_shadow",
          cohort: "external_f2",
          openCohorts: ["internal_f2"],
          optIn: true,
        }),
      ),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "cohort_closed",
    });
    expect(
      decideRollout(
        input({
          requestedLane: "openclaw_candidate",
          cohort: "f3",
          openCohorts: [],
          optIn: true,
        }),
      ),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "cohort_closed",
    });
  });

  it("requires optIn === true, not a truthy stand-in", () => {
    expect(
      decideRollout({
        ...input({
          requestedLane: "openclaw_shadow",
          openCohorts: ["internal_f2"],
        }),
        optIn: "yes" as unknown as boolean,
      }),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "cohort_closed",
    });
  });

  it("requires opt-in even when the cohort is open", () => {
    expect(
      decideRollout(
        input({
          requestedLane: "openclaw_shadow",
          cohort: "internal_f2",
          openCohorts: ["internal_f2", "owner_opt_in"],
          optIn: false,
        }),
      ),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "cohort_closed",
    });
    expect(
      decideRollout(
        input({
          requestedLane: "openclaw_candidate",
          cohort: "owner_opt_in",
          openCohorts: ["owner_opt_in"],
          optIn: false,
        }),
      ),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "cohort_closed",
    });
  });

  it("opens the requested shadow lane only after opt-in and an open cohort", () => {
    expect(
      decideRollout(
        input({
          requestedLane: "openclaw_shadow",
          cohort: "internal_f2",
          openCohorts: ["internal_f2"],
          optIn: true,
        }),
      ),
    ).toEqual({
      lane: "openclaw_shadow",
      fallbackClassic: true,
      reason: "opt_in",
    });
  });

  it("opens a requested candidate lane only after explicit opt-in", () => {
    expect(
      decideRollout(
        input({
          requestedLane: "openclaw_candidate",
          cohort: "owner_opt_in",
          openCohorts: ["owner_opt_in"],
          optIn: true,
        }),
      ),
    ).toEqual({
      lane: "openclaw_candidate",
      fallbackClassic: true,
      reason: "opt_in",
    });
  });

  it("never upgrades a shadow request into candidate writes", () => {
    const decision = decideRollout(
      input({
        requestedLane: "openclaw_shadow",
        cohort: "internal_f2",
        openCohorts: ["internal_f2"],
        optIn: true,
      }),
    );
    expect(decision.lane).toBe("openclaw_shadow");
    expect(decision.lane).not.toBe("openclaw_candidate");
  });

  it("defaults requested classic to classic even when opt-in is open", () => {
    expect(
      decideRollout(
        input({
          requestedLane: "classic",
          optIn: true,
          openCohorts: ["internal_f2", "owner_opt_in", "f3"],
        }),
      ),
    ).toEqual({
      lane: "classic",
      fallbackClassic: true,
      reason: "default_classic",
    });
  });

  it("treats an unknown garbage lane as classic + default_classic", () => {
    for (const requestedLane of ["", "   ", "not-a-lane", "OPENCLAW_SHADOW", "candidate"]) {
      expect(decideRollout(input({ requestedLane, optIn: true }))).toEqual({
        lane: "classic",
        fallbackClassic: true,
        reason: "default_classic",
      });
    }
  });

  it("keeps fallbackClassic true on every decision", () => {
    const cases: DecideRolloutInput[] = [
      input({ killSwitch: true }),
      input({ requestedLane: "classic" }),
      input({ requestedLane: "openclaw_shadow", optIn: false }),
      input({
        requestedLane: "openclaw_shadow",
        cohort: "imported",
        openCohorts: ["internal_f2"],
        optIn: true,
      }),
      input({
        requestedLane: "openclaw_shadow",
        openCohorts: ["internal_f2"],
        optIn: true,
      }),
      input({
        requestedLane: "openclaw_candidate",
        openCohorts: ["internal_f2"],
        optIn: true,
      }),
      input({ requestedLane: "garbage" }),
    ];
    for (const rolloutInput of cases) {
      const decision: RolloutDecision = decideRollout(rolloutInput);
      expect(decision.fallbackClassic).toBe(true);
    }
  });
});
