import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Innehållsrevisionens steg 2: verdiktraden ska bära den revision den bedömde.
 *
 * Stämplingen ligger i tjänsten, inte hos anroparen, av samma skäl som
 * versionskolumnen är DB-genererad — en glömd stämpel blir tyst `null`, och
 * `null` betyder fail-open. Testerna låser att den inte kan glömmas och att en
 * versionslös rad inte försöker slå upp något.
 */
const insertCapture = vi.hoisted(() => ({ values: null as Record<string, unknown> | null }));

vi.mock("@/lib/db/client", () => {
  const db = {
    insert: () => ({
      values: (payload: Record<string, unknown>) => {
        insertCapture.values = payload;
        return { returning: () => Promise.resolve([{ id: "tel_1" }]) };
      },
    }),
  };
  return { db, dbConfigured: true };
});

const { createGenerationTelemetryRecord } = await import("./generation-telemetry");

describe("createGenerationTelemetryRecord — innehållsrevision", () => {
  beforeEach(() => {
    insertCapture.values = null;
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
});
