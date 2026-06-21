import { describe, expect, it } from "vitest";

import { selectVersionStatus } from "./event-bus-projection";
import type { EngineEvent, VersionStatus } from "./event-bus-types";

/**
 * Grandmaster A7-1 — false-green-invariant i statusprojektionen.
 *
 * Källa: docs/plans/active/grandmaster/aktiviteter/A7-1-false-green-stability-test.md
 *        docs/plans/active/grandmaster/02-stabilitetstester.md  (seed-invariant
 *        "Placeholder/degraded visas aldrig som 'success'", P1 N#1, falskt-grönt).
 *        Delivery-bias: varje stabilitetstest pekar på sin källa.
 *
 * Invariant som låses (REDAN sann på master — testet låser nuvarande beteende,
 * ingen runtime-ändring): en version som når terminal `version.done` EFTER att den
 * degraderats (`version.degraded`) måste fortfarande exponera sina `degradations[]`.
 * Terminal `done` får aldrig läsas som "solid green" — annars maskerar UI:t att en
 * skeppad version saknar verifier-/postcheck-täckning (precis den falskt-gröna
 * lögnen område 7 jagar).
 *
 * Ren enhet (ingen live-builder, ingen DB, ingen preview): bara den rena,
 * deterministiska `selectVersionStatus(events)` mot en in-memory event-sekvens.
 *
 * Avgränsning mot event-bus-projection.test.ts: det testet låser att degradations
 * SAMLAS (utan föregående done) och RENSAS av en ren `version.saved`. Detta test
 * låser den distinkta aspekten att degraderingar som emitteras post-finalize
 * ÖVERLEVER terminal `done`. Påstår INTE stub/placeholder → degraded (ej sant på
 * master än — det är A7-2).
 */

const BASE = {
  runId: "root",
  versionId: "v1",
  chatId: "c1",
};

function ev<T extends EngineEvent["t"]>(
  t: T,
  extra: Omit<Extract<EngineEvent, { t: T }>, "t" | "id" | "ts" | "versionId" | "chatId" | "runId"> &
    Partial<{ id: string; ts: string; runId: string; versionId: string }>,
): Extract<EngineEvent, { t: T }> {
  return {
    t,
    id: extra.id ?? `${t}-${Math.random().toString(36).slice(2, 8)}`,
    ts: extra.ts ?? "2026-06-18T10:00:00.000Z",
    versionId: extra.versionId ?? BASE.versionId,
    chatId: BASE.chatId,
    runId: extra.runId ?? BASE.runId,
    ...(extra as object),
  } as Extract<EngineEvent, { t: T }>;
}

/**
 * Lokal "solid green"-definition: terminal-klart OCH inga blockerare OCH inga
 * kvarvarande degraderingar. Speglar vad UI:t skulle få visa som problemfri grön.
 */
function isSolidGreen(s: VersionStatus): boolean {
  return (
    s.done &&
    s.phase === "done" &&
    !s.previewBlocked &&
    !s.verificationBlocked &&
    s.degradations.length === 0
  );
}

describe("A7-1 false-green: terminal done raderar inte degraderingar", () => {
  it("behåller degradations[] när version.done följer efter version.degraded", () => {
    // Speglar verklig post-finalize: ren finalize (clean preflight + clean saved,
    // som RENSAR ev. tidigare passes degraderingar) → post-finalize-policyn emitterar
    // två degraderingar → strömmen termineras med version.done.
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.saved", {
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.degraded", {
        kind: "verifier_skipped_by_policy",
        message: "Server-verify skipped (design_preview_skip_verify).",
        meta: { reason: "design_preview_skip_verify" },
      }),
      ev("version.degraded", {
        kind: "product_postcheck_skipped",
        message: "F2 Product Postcheck skipped (missing_preview_url).",
        meta: { skippedReason: "missing_preview_url" },
      }),
      ev("version.done", { durationMs: 18_000, previewUrl: "https://example.test" }),
    ]);

    // Terminal done är nådd …
    expect(status.phase).toBe("done");
    expect(status.done).toBe(true);

    // … men degraderingarna är INTE raderade av terminal done.
    expect(status.degradations.length).toBeGreaterThan(0);
    expect(status.degradations.map((d) => d.kind)).toEqual([
      "verifier_skipped_by_policy",
      "product_postcheck_skipped",
    ]);

    // Kärn-invarianten: en degraderad done får aldrig läsas som solid green.
    expect(isSolidGreen(status)).toBe(false);
  });

  it("product_postcheck_blocked (postcheck körde + hittade blockerande fel) överlever done → aldrig solid green", () => {
    // Område 7 / #180: en postcheck som RAN och dömde produkten trasig (död
    // mobilmeny / 2+ brutna in-page-ankare) emitterar product_postcheck_blocked.
    // Den degraderingen måste — precis som _skipped — överleva terminal done så
    // livscykel-badgen aldrig blir solid grön på en sida med trasig kärninteraktion.
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.saved", {
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.degraded", {
        kind: "product_postcheck_blocked",
        message:
          "F2 Product Postcheck hittade blockerande produktfel (mobile_menu_failed, broken_anchor).",
        meta: { blockingCodes: ["mobile_menu_failed", "broken_anchor"], warningCount: 3 },
      }),
      ev("version.done", { durationMs: 12_000, previewUrl: "https://example.test" }),
    ]);

    expect(status.phase).toBe("done");
    expect(status.done).toBe(true);
    expect(status.degradations.map((d) => d.kind)).toContain("product_postcheck_blocked");
    expect(isSolidGreen(status)).toBe(false);
  });

  it("isSolidGreen är sann endast för en ren done utan degraderingar (icke-vacuös vakt)", () => {
    // Kontrolltest så att assertionen ovan inte passerar trivialt: en identisk
    // ren finalize UTAN degraderingar SKA läsas som solid green.
    const status = selectVersionStatus([
      ev("version.started", { generationKind: "create" }),
      ev("version.preflight", {
        filesChecked: 12,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.saved", {
        previewBlocked: false,
        verificationBlocked: false,
      }),
      ev("version.done", { durationMs: 18_000, previewUrl: "https://example.test" }),
    ]);

    expect(status.degradations).toEqual([]);
    expect(isSolidGreen(status)).toBe(true);
  });
});
