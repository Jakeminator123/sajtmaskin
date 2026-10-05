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

const getVersionById = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  getVersionById,
  getKnownBrokenImageReplacements: vi.fn(),
}));

import {
  assertPromoteAllowed,
  scopePromotionSnapshotForVersion,
} from "./promote-guard";
import type { QualityGateSignal } from "./services/generation-telemetry";
import {
  getVersionFiles,
  parseCodeFilesFromFilesJson,
} from "@/lib/gen/version-manager";

const REVISION_N = "1".repeat(32);
const REVISION_N_PLUS_1 = "2".repeat(32);

describe("stored code file boundary", () => {
  it("accepts a legacy file without language", () => {
    expect(
      parseCodeFilesFromFilesJson(
        JSON.stringify([{ path: "app/page.tsx", content: "export default null" }]),
      ),
    ).toEqual([{ path: "app/page.tsx", content: "export default null" }]);
  });

  it.each([
    ["non-array", JSON.stringify({ path: "app/page.tsx", content: "x" })],
    ["primitive entry", JSON.stringify([{ path: "app/page.tsx", content: "x" }, null])],
    ["array entry", JSON.stringify([["app/page.tsx", "x"]])],
    ["missing path", JSON.stringify([{ content: "x" }])],
    ["non-string content", JSON.stringify([{ path: "app/page.tsx", content: 42 }])],
    [
      "non-string language",
      JSON.stringify([{ path: "app/page.tsx", content: "x", language: 42 }]),
    ],
  ])("rejects the entire stored set for a malformed %s", (_case, filesJson) => {
    expect(parseCodeFilesFromFilesJson(filesJson)).toBeNull();
  });

  it("makes getVersionFiles unavailable instead of filtering a malformed entry", async () => {
    getVersionById.mockResolvedValue({
      id: "ver_malformed",
      chat_id: "chat_1",
      files_json: JSON.stringify([
        { path: "app/page.tsx", content: "valid" },
        { path: "app/route.ts", content: null },
      ]),
    });

    await expect(getVersionFiles("ver_malformed")).resolves.toBeNull();
  });
});

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
  // äldre rader — se "Väntar på ägarbeslut" i backloggen). En stale `passed` ger
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

  it("bär det överspelade verdiktet maskinläsbart, inte bara i prosan", async () => {
    // `staleRevision` klassas FÖRE blocking-checken, så ett `verifier_failed`
    // för revision N ser ut precis som ett `preflight_passed` för N hos en
    // anropare som bara tittar på flaggan. `/quality-gate`s omtag måste kunna
    // skilja dem åt utan att parsa `reason` (annars stämplas ett färskt
    // preflight_passed ovanpå en verifier-underkänd version).
    const rejected = await assertPromoteAllowed("ver-1", async () =>
      staleSignal("verifier_failed"),
    );
    const passed = await assertPromoteAllowed("ver-1", async () =>
      staleSignal("preflight_passed"),
    );

    expect(rejected.allowed).toBe(false);
    expect(passed.allowed).toBe(false);
    if (!rejected.allowed && !passed.allowed) {
      expect("staleSignal" in rejected && rejected.staleSignal).toBe("verifier_failed");
      expect("staleSignal" in passed && passed.staleSignal).toBe("preflight_passed");
      // Guarden äger vad "blockerande" betyder — konsumenten ska inte
      // återhärleda det ur PROMOTE_BLOCKING_QUALITY_GATE_RESULTS.
      expect("staleSignalBlocking" in rejected && rejected.staleSignalBlocking).toBe(true);
      expect("staleSignalBlocking" in passed && passed.staleSignalBlocking).toBe(false);
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

describe("assertPromoteAllowed — provider migration context", () => {
  const clerkFiles = JSON.stringify([
    {
      path: "package.json",
      content: JSON.stringify({ dependencies: { "@clerk/nextjs": "latest" } }),
    },
    { path: "app/page.tsx", content: 'import { ClerkProvider } from "@clerk/nextjs";' },
  ]);
  const auth0Snapshot = {
    contractIntegrations: [
      {
        kind: "auth",
        providerKey: "auth0",
        dossierCapability: "auth",
        provider: "Auth0",
        name: "Auth0",
        reason: "Explicit target",
        status: "chosen",
        selectionSource: "explicit",
      },
    ],
  };

  it("scopes the latest chat snapshot away only for an explicit restore version", () => {
    expect(scopePromotionSnapshotForVersion(auth0Snapshot, "restore")).toBeNull();
    expect(scopePromotionSnapshotForVersion(auth0Snapshot, null)).toBe(auth0Snapshot);
    expect(scopePromotionSnapshotForVersion(auth0Snapshot, "manual")).toBe(auth0Snapshot);
  });

  it("allows restored Clerk bytes despite a newer Auth0 chat contract", async () => {
    const decision = await assertPromoteAllowed("ver-restore", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: clerkFiles,
        orchestrationSnapshot: scopePromotionSnapshotForVersion(
          auth0Snapshot,
          "restore",
        ),
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("holds a provider migration even when the candidate deleted the old core", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: clerkFiles,
        candidateFilesJson: JSON.stringify([{ path: "app/page.tsx", content: "export default null" }]),
        orchestrationSnapshot: auth0Snapshot,
      },
    });
    expect(decision).toMatchObject({ allowed: false, indeterminate: true });
  });

  it("holds promotion for divergent REST-backed dossier core without SDK evidence", async () => {
    const mailchimpFiles = JSON.stringify([
      {
        path: "components/newsletter-form.tsx",
        content: "export function NewsletterForm() { return null; } // older bytes",
      },
      {
        path: "app/api/newsletter-subscribe/route.ts",
        content: "export const POST = async () => new Response('older bytes');",
      },
    ]);
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: mailchimpFiles,
        candidateFilesJson: mailchimpFiles,
        orchestrationSnapshot: null,
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      indeterminate: true,
      reason: "integration migration requires review before promotion",
    });
  });

  it("treats one malformed file entry as an unavailable migration decision", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: JSON.stringify([
          { path: "app/page.tsx", content: "ok" },
          { path: "app/broken.tsx" },
        ]),
        orchestrationSnapshot: null,
      },
    });
    expect(decision).toMatchObject({ allowed: false, indeterminate: true });
  });

  it.each([
    ["current", "[]", JSON.stringify([{ path: "app/page.tsx", content: "ok" }])],
    ["candidate", JSON.stringify([{ path: "app/page.tsx", content: "ok" }]), "[]"],
  ])("holds an empty %s file set as unavailable", async (_which, currentFilesJson, candidateFilesJson) => {
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson,
        candidateFilesJson,
        orchestrationSnapshot: null,
      },
    });
    expect(decision).toMatchObject({ allowed: false, indeterminate: true });
  });

  it("keeps no-contract legacy promotion available for valid files", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: JSON.stringify([{ path: "app/page.tsx", content: "ok" }]),
        orchestrationSnapshot: null,
      },
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("keeps a malformed provider-contract snapshot retryable instead of treating it as legacy", async () => {
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: JSON.stringify([{ path: "app/page.tsx", content: "ok" }]),
        orchestrationSnapshot: { contractIntegrations: { providerKey: "clerk" } },
      },
    });
    expect(decision).toMatchObject({ allowed: false, indeterminate: true });
  });

  it("allows a repair that removes the current Stripe implementation under a payments tombstone", async () => {
    const stripeFiles = JSON.stringify([
      { path: "package.json", content: JSON.stringify({ dependencies: { stripe: "latest" } }) },
      { path: "app/api/checkout/route.ts", content: 'import Stripe from "stripe"; export const POST = () => Stripe;' },
    ]);
    const cleanCandidate = JSON.stringify([
      { path: "app/page.tsx", content: "export default function Page() { return null; }" },
    ]);

    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: stripeFiles,
        candidateFilesJson: cleanCandidate,
        orchestrationSnapshot: { removedCapabilities: ["payments"] },
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("holds a candidate that still contains provider evidence for a removed capability", async () => {
    const stripeFiles = JSON.stringify([
      { path: "package.json", content: JSON.stringify({ dependencies: { stripe: "latest" } }) },
      { path: "app/api/checkout/route.ts", content: 'import Stripe from "stripe"; export const POST = () => Stripe;' },
    ]);

    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: stripeFiles,
        candidateFilesJson: stripeFiles,
        orchestrationSnapshot: { removedCapabilities: ["payments"] },
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      indeterminate: true,
      code: "integration_migration_required",
    });
  });

  it("holds REST-backed canonical dossier residue by exact removed dossier id", async () => {
    const mailchimpFiles = JSON.stringify([
      {
        path: "components/newsletter-form.tsx",
        content: "export function NewsletterForm() { return null; }",
      },
      {
        path: "app/api/newsletter-subscribe/route.ts",
        content: "export const POST = async () => new Response('ok');",
      },
    ]);

    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: mailchimpFiles,
        candidateFilesJson: mailchimpFiles,
        orchestrationSnapshot: { removedDossierIds: ["mailchimp-newsletter"] },
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      indeterminate: true,
      code: "integration_migration_required",
    });
  });

  it("allows a repair after REST-backed dossier files are fully removed", async () => {
    const mailchimpFiles = JSON.stringify([
      { path: "components/newsletter-form.tsx", content: "older form" },
      { path: "app/api/newsletter-subscribe/route.ts", content: "older route" },
    ]);
    const cleanCandidate = JSON.stringify([
      { path: "app/page.tsx", content: "export default function Page() { return null; }" },
    ]);
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: mailchimpFiles,
        candidateFilesJson: cleanCandidate,
        orchestrationSnapshot: { removedDossierIds: ["mailchimp-newsletter"] },
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("does not treat Supabase auth evidence as database residue", async () => {
    const supabaseAuthFiles = JSON.stringify([
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { "@supabase/ssr": "latest" } }),
      },
      {
        path: "lib/supabase/server.ts",
        content: 'import { createServerClient } from "@supabase/ssr"; export { createServerClient };',
      },
    ]);
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: supabaseAuthFiles,
        candidateFilesJson: supabaseAuthFiles,
        orchestrationSnapshot: { removedCapabilities: ["database"] },
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("does not count package-only or type-only imports as residual provider proof", async () => {
    const typeOnlyStripe = JSON.stringify([
      { path: "package.json", content: JSON.stringify({ dependencies: { stripe: "latest" } }) },
      { path: "lib/types.ts", content: 'import type Stripe from "stripe"; export type S = Stripe;' },
    ]);
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: typeOnlyStripe,
        candidateFilesJson: typeOnlyStripe,
        orchestrationSnapshot: { removedCapabilities: ["payments"] },
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("fails closed when a removal tombstone is present but malformed", async () => {
    const files = JSON.stringify([{ path: "app/page.tsx", content: "export default null" }]);
    const decision = await assertPromoteAllowed("ver-1", async () => null, {
      onReadError: "indeterminate",
      migrationContext: {
        currentFilesJson: files,
        candidateFilesJson: files,
        orchestrationSnapshot: { removedCapabilities: null },
      },
    });

    expect(decision).toMatchObject({ allowed: false, indeterminate: true });
    expect(decision).not.toHaveProperty("code");
  });
});
