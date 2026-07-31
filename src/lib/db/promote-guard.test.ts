import { describe, expect, it, vi } from "vitest";

// Stub the telemetry service so importing the guard does not pull in the real
// DB client (which throws at import time without a connection string). Every
// test below injects its own reader, so this mock's value is never used.
vi.mock("./services/generation-telemetry", () => ({
  getLatestQualityGateSignalForVersion: vi.fn(async () => ({
    result: null,
    revisionMatch: "unknown" as const,
    verdictRevision: null,
    contentRevision: null,
  })),
}));

import { assertPromoteAllowed } from "./promote-guard";
import type { QualityGateSignal } from "./services/generation-telemetry";

const REVISION_N = "1".repeat(32);
const REVISION_N_PLUS_1 = "2".repeat(32);

/** Verdikt som beskriver revision N medan innehållet är N+1 — känd mismatch. */
function staleSignal(result: string | null): QualityGateSignal {
  return {
    result,
    revisionMatch: "stale",
    verdictRevision: REVISION_N,
    contentRevision: REVISION_N_PLUS_1,
  };
}

/** Verdikt som beskriver exakt det innehåll som ska promotas. */
function currentSignal(result: string | null): QualityGateSignal {
  return {
    result,
    revisionMatch: "current",
    verdictRevision: REVISION_N_PLUS_1,
    contentRevision: REVISION_N_PLUS_1,
  };
}

describe("assertPromoteAllowed (false-green promotion guard)", () => {
  it("blocks promotion when the finalize verifier failed", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "verifier_failed");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed && "signal" in decision) {
      expect(decision.signal).toBe("verifier_failed");
      expect(decision.reason).toContain("verifier_failed");
    }
  });

  it("blocks promotion when preflight verification failed", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "preflight_failed");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed && "signal" in decision) {
      expect(decision.signal).toBe("preflight_failed");
    }
  });

  it("allows promotion when the finalize quality gate passed", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "preflight_passed");
    expect(decision.allowed).toBe(true);
  });

  it("fails open (allows) when no telemetry signal exists (backcompat / older rows)", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => null);
    expect(decision.allowed).toBe(true);
  });

  it("fails open by default (allows) when the signal read throws (back-compat)", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => {
      throw new Error("db not configured");
    });
    expect(decision.allowed).toBe(true);
  });

  it("fails closed (indeterminate) on a read error when opted in (B08)", async () => {
    const decision = await assertPromoteAllowed(
      "ver-1",
      async () => {
        throw new Error("db timeout");
      },
      { onReadError: "indeterminate" },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect("indeterminate" in decision && decision.indeterminate).toBe(true);
      expect(decision.reason).toContain("promote guard signal unavailable");
      expect(decision.reason).toContain("db timeout");
    }
  });

  it("still ALLOWS a null (no-telemetry) signal even when opted into fail-closed", async () => {
    // A `null` is not a read ERROR — the no-telemetry back-compat path must stay
    // fail-open regardless of `onReadError`, so template-import/rollback rows are
    // never blocked.
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
    });
    expect(decision.allowed).toBe(true);
  });

  it("still BLOCKS an explicit blocking signal even when opted into fail-closed", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "verifier_failed", {
      onReadError: "indeterminate",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect("indeterminate" in decision).toBe(false);
      expect("signal" in decision && decision.signal).toBe("verifier_failed");
    }
  });

  it("does not block on unknown/legacy signal values", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => "some_future_value");
    expect(decision.allowed).toBe(true);
  });

  // Re-triage 2026-07-25 av backlog-raden "stale quality-gate-telemetri
  // överlever invalidateVerification". Den påstod att en STALE `preflight_passed`
  // (från före en användar-edit) kan false-green:a en promote. Guarden är
  // dock ALLOW-by-default: bara `verifier_failed`/`preflight_failed` blockerar,
  // och `null` är medvetet fail-open (back-compat: template-import, rollback,
  // äldre rader — se "Beslut & policy" i backloggen). En stale `passed` ger
  // därför INGET som en superseding null-rad inte redan skulle ge — den
  // föreslagna fixen ("skriv en superseding rad") kan inte stänga något hål.
  // Detta test låser fast ekvivalensen så nästa agent inte bygger den fixen.
  it("treats a stale passed signal identically to no signal (allow-by-default)", async () => {
    const stalePassed = await assertPromoteAllowed("ver-1", async () => "preflight_passed", {
      onReadError: "indeterminate",
    });
    const supersededToNull = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
    });
    expect(stalePassed.allowed).toBe(true);
    expect(supersededToNull.allowed).toBe(true);
    expect(stalePassed.allowed).toBe(supersededToNull.allowed);
  });

  // Samma re-triage, motsatt riktning: den ENDA konkreta effekten av stale
  // telemetri är för-strikt (en `verifier_failed` från före editen blockar en
  // legitim promote av det NYA innehållet) — och den självläker så snart någon
  // gate körs och skriver en färsk rad.
  it("blocks on a stale failing signal until a fresh gate row supersedes it", async () => {
    const staleFailed = await assertPromoteAllowed("ver-1", async () => "verifier_failed");
    expect(staleFailed.allowed).toBe(false);
    const afterFreshGate = await assertPromoteAllowed("ver-1", async () => "preflight_passed");
    expect(afterFreshGate.allowed).toBe(true);
  });
});

/**
 * Innehållsrevision steg 3 (flaggad hos läsaren, se
 * `generation-telemetry.content-revision.test.ts`). Guarden får en signal som
 * bär revisionsläget — här matas det in direkt, så testerna beskriver GUARDENS
 * beslut, inte DB-läsningen.
 */
describe("assertPromoteAllowed — verdikt för en annan innehållsrevision", () => {
  it("ett passed för revision N grönmarkerar inte N+1 (bugg-typ 1 och 2)", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () =>
      staleSignal("preflight_passed"),
    );

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect("indeterminate" in decision && decision.indeterminate).toBe(true);
      expect("staleRevision" in decision && decision.staleRevision).toBe(true);
      expect(decision.reason).toContain("another content revision");
    }
  });

  it("ett failed för revision N blockerar inte terminalt N+1 heller — samma retrybara läge (bugg-typ 4)", async () => {
    // Symmetrin i beslut 1a: mismatchen kastar verdiktet i BÅDA riktningar.
    // Skillnaden mot ett äkta `verifier_failed` är avgörande: `indeterminate`
    // betyder "kör gaten igen", inte "versionen är underkänd" — så en
    // watchdog (`promoteVersionIfUnleased`) settlar inte raden terminalt.
    const decision = await assertPromoteAllowed("ver-1", async () =>
      staleSignal("verifier_failed"),
    );

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect("indeterminate" in decision && decision.indeterminate).toBe(true);
      expect("signal" in decision).toBe(false);
    }
  });

  it("mismatch är retrybar oavsett onReadError — det är inte ett läsfel", async () => {
    const withDefault = await assertPromoteAllowed("ver-1", async () =>
      staleSignal("preflight_passed"),
    );
    const withFailClosed = await assertPromoteAllowed(
      "ver-1",
      async () => staleSignal("preflight_passed"),
      { onReadError: "indeterminate" },
    );

    expect(withDefault.allowed).toBe(false);
    expect(withFailClosed.allowed).toBe(false);
  });

  it("en färsk gate för det nya innehållet släpper igenom promoten", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () =>
      currentSignal("preflight_passed"),
    );
    expect(decision.allowed).toBe(true);
  });

  it("ett matchande failed blockerar fortfarande explicit (inte indeterminate)", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () =>
      currentSignal("verifier_failed"),
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect("signal" in decision && decision.signal).toBe("verifier_failed");
      expect("indeterminate" in decision).toBe(false);
    }
  });

  it("okänd revision är fail-open — en rad från före steg 2 spärrar ingenting", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => ({
      result: "preflight_passed",
      revisionMatch: "unknown" as const,
      verdictRevision: null,
      contentRevision: null,
    }));
    expect(decision.allowed).toBe(true);
  });

  it("en läsare som svarar med en ren sträng behandlas som okänd revision (back-compat)", async () => {
    // Alla äldre callsites/tester injicerar `string | null`. De ska bete sig
    // exakt som förut, alltså aldrig träffa mismatch-grenen.
    expect((await assertPromoteAllowed("ver-1", async () => "preflight_passed")).allowed).toBe(
      true,
    );
    expect((await assertPromoteAllowed("ver-1", async () => null)).allowed).toBe(true);
  });
});
