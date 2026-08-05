import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Innehållsrevisionens steg 2: verdiktraden ska bära den revision den bedömde.
 *
 * Stämplingen ligger i tjänsten, inte hos anroparen, av samma skäl som
 * versionskolumnen är DB-genererad — en glömd stämpel blir tyst `null`, och
 * `null` betyder fail-open. Testerna låser att den inte kan glömmas och att en
 * versionslös rad inte försöker slå upp något.
 */
const insertCapture = vi.hoisted(() => ({
  values: null as Record<string, unknown> | null,
  count: 0,
}));
const telemetryRows = vi.hoisted(() => ({ value: [] as Record<string, unknown>[] }));

vi.mock("@/lib/db/client", () => {
  const db = {
    insert: () => ({
      values: (payload: Record<string, unknown>) => {
        insertCapture.values = payload;
        insertCapture.count += 1;
        return { returning: () => Promise.resolve([{ id: "tel_1" }]) };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => Promise.resolve(telemetryRows.value) }),
      }),
    }),
  };
  return { db, dbConfigured: true };
});

const {
  createGenerationTelemetryRecord,
  recordRepairPassedQualityGate,
  recordQualityGatePassedForCurrentContent,
} = await import("./generation-telemetry");

const REPAIR_A = '[{"path":"app/page.tsx","content":"A-fixed"}]';
const REPAIR_B = '[{"path":"app/page.tsx","content":"B-fixed"}]';
const md5 = (content: string) => createHash("md5").update(content, "utf8").digest("hex");

function priorPass(filesRevision: string | null) {
  return {
    chatId: "chat_1",
    model: "gpt-5.4",
    qualityGateResult: "preflight_passed",
    filesRevision,
  };
}

describe("createGenerationTelemetryRecord — innehållsrevision", () => {
  beforeEach(() => {
    insertCapture.values = null;
    insertCapture.count = 0;
  });

  it("stämplar revisionen från versionen, utan att anroparen skickar den", async () => {
    await createGenerationTelemetryRecord({
      chatId: "chat_1",
      versionId: "ver_1",
      model: "gpt-5.4",
      qualityGateResult: "preflight_passed",
    });

    const revision = insertCapture.values?.filesRevision;
    expect(revision).not.toBeNull();
    // Subselect mot engine_versions, inte ett värde anroparen hittat på.
    const rendered = JSON.stringify(revision);
    expect(rendered).toContain("files_revision");
    expect(rendered).toContain("engine_versions");
    expect(rendered).toContain("ver_1");
  });

  it("lämnar revisionen null för en versionslös rad", async () => {
    await createGenerationTelemetryRecord({
      chatId: "chat_1",
      model: "gpt-5.4",
    });

    expect(insertCapture.values?.versionId).toBeNull();
    expect(insertCapture.values?.filesRevision).toBeNull();
  });

  /**
   * Repair-lanen bedömer `repaired_files_json` medan `files_json` fortfarande
   * håller basen som föll. Subselecten skulle då arkivera passet under fel
   * innehåll (Bugbot/Codex/Vercel på #642).
   */
  it("hashar det bedömda innehållet i stället för versionens bas när repair skickar det", async () => {
    await createGenerationTelemetryRecord({
      chatId: "chat_1",
      versionId: "ver_1",
      model: "gpt-5.4",
      qualityGateResult: "preflight_passed",
      assessedFilesJson: '[{"path":"app/page.tsx","content":"fixed"}]',
      meta: { source: "server-repair-pass" },
    });

    const rendered = JSON.stringify(insertCapture.values?.filesRevision);
    expect(rendered).toContain("md5");
    expect(rendered).toContain("fixed");
    // Ingen uppslagning mot versionens nuvarande (pre-repair) innehåll.
    expect(rendered).not.toContain("engine_versions");
  });
});

/**
 * En version kan få ett ERSÄTTANDE repair-varv innan acceptance. Ett befintligt
 * `preflight_passed` är därför bara ett duplikat när det beskriver samma
 * innehåll — annars promotas kandidat B medan senaste passet bär A:s revision
 * (Codex P1 på #646).
 */
describe("recordRepairPassedQualityGate — ersättande repair", () => {
  beforeEach(() => {
    insertCapture.values = null;
    insertCapture.count = 0;
    telemetryRows.value = [];
  });

  it("stämplar om när ett andra repair-varv bedömde annat innehåll", async () => {
    telemetryRows.value = [priorPass(md5(REPAIR_A))];

    await recordRepairPassedQualityGate("ver_1", REPAIR_B);

    expect(insertCapture.count).toBe(1);
    expect(JSON.stringify(insertCapture.values?.filesRevision)).toContain("B-fixed");
  });

  it("hoppar över när passet redan beskriver samma innehåll", async () => {
    telemetryRows.value = [priorPass(md5(REPAIR_A))];

    await recordRepairPassedQualityGate("ver_1", REPAIR_A);

    expect(insertCapture.count).toBe(0);
  });

  it("stämplar om när det tidigare passet saknar revision (rad före steg 2)", async () => {
    telemetryRows.value = [priorPass(null)];

    await recordRepairPassedQualityGate("ver_1", REPAIR_A);

    expect(insertCapture.count).toBe(1);
  });

  it("behåller gamla beteendet när anroparen inte skickar bedömt innehåll", async () => {
    telemetryRows.value = [priorPass(md5(REPAIR_A))];

    await recordRepairPassedQualityGate("ver_1");

    expect(insertCapture.count).toBe(0);
  });
});

describe("recordQualityGatePassedForCurrentContent — staleRevision reassess", () => {
  beforeEach(() => {
    insertCapture.values = null;
    insertCapture.count = 0;
    telemetryRows.value = [];
  });

  it("stämplar preflight_passed med versionens aktuella revision (subselect)", async () => {
    telemetryRows.value = [priorPass(md5(REPAIR_A))];

    const stamped = await recordQualityGatePassedForCurrentContent("ver_1");

    expect(stamped).toBe(true);
    expect(insertCapture.count).toBe(1);
    expect(insertCapture.values?.qualityGateResult).toBe("preflight_passed");
    expect(insertCapture.values?.meta).toEqual({
      source: "quality-gate-stale-revision-reassess",
    });
    // Nuvarande innehåll — inte assessedFilesJson — så subselect mot version-raden.
    const rendered = JSON.stringify(insertCapture.values?.filesRevision);
    expect(rendered).toContain("engine_versions");
    expect(rendered).toContain("files_revision");
  });

  it("hoppar över när ingen prior telemetry finns (fail-open redan)", async () => {
    telemetryRows.value = [];

    const stamped = await recordQualityGatePassedForCurrentContent("ver_1");

    expect(stamped).toBe(false);
    expect(insertCapture.count).toBe(0);
  });
});
