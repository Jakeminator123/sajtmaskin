import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Innehållsrevision steg 3: **läsaren jämför**.
 *
 * Ett verdikt beskriver ett innehåll, inte ett `versionId`. Testerna låser de tre
 * lägen kontraktet består av:
 *
 *   - `current` — raden bär innehållets revision → verdiktet är ett svar.
 *   - `stale`   — raden bär en ANNAN revision → inget svar, symmetriskt för
 *                 `passed` och `failed` (planens beslut 1a).
 *   - `unknown` — ingen revision att jämföra → dagens fail-open (beslut 1b).
 *
 * Plus den viktigaste regressionsspärren: med flaggan av ska beteendet vara
 * bit-för-bit dagens, inklusive att ingen extra DB-läsning sker.
 */
const telemetryRows = vi.hoisted(() => ({ value: [] as Record<string, unknown>[] }));
const versionRows = vi.hoisted(() => ({ value: [] as Record<string, unknown>[], reads: 0 }));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve(telemetryRows.value),
          limit: () => {
            versionRows.reads += 1;
            return Promise.resolve(versionRows.value);
          },
        }),
      }),
    }),
  },
}));

const { getLatestQualityGateSignalForVersion } = await import("./generation-telemetry");

const REVISION_N = "1".repeat(32);
const REVISION_N_PLUS_1 = "2".repeat(32);
const md5 = (content: string) => createHash("md5").update(content, "utf8").digest("hex");

function telemetryRow(qualityGateResult: string | null, filesRevision: string | null) {
  return { id: "tel_1", chatId: "chat_1", qualityGateResult, filesRevision };
}

describe("getLatestQualityGateSignalForVersion — flaggan PÅ", () => {
  beforeEach(() => {
    process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
    telemetryRows.value = [];
    versionRows.value = [{ filesRevision: REVISION_N_PLUS_1 }];
    versionRows.reads = 0;
  });

  afterEach(() => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  it("ett passed för revision N besvarar inte en fråga om N+1 (false-green stängd)", async () => {
    telemetryRows.value = [telemetryRow("preflight_passed", REVISION_N)];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("stale");
    expect(signal.verdictRevision).toBe(REVISION_N);
    expect(signal.contentRevision).toBe(REVISION_N_PLUS_1);
    // Resultatet följer med för loggning, men läsaren ska INTE tolka det som svar.
    expect(signal.result).toBe("preflight_passed");
  });

  it("ett failed för revision N besvarar inte heller en fråga om N+1 (bugg-typ 4, symmetri)", async () => {
    telemetryRows.value = [telemetryRow("verifier_failed", REVISION_N)];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("stale");
    expect(signal.result).toBe("verifier_failed");
  });

  it("en rad vars revision ÄR innehållets är ett svar", async () => {
    telemetryRows.value = [telemetryRow("verifier_failed", REVISION_N_PLUS_1)];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("current");
    expect(signal.result).toBe("verifier_failed");
  });

  it("saknad revision på verdiktraden är okänd — aldrig mismatch (fail-open)", async () => {
    telemetryRows.value = [telemetryRow("verifier_failed", null)];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("unknown");
    expect(signal.result).toBe("verifier_failed");
  });

  it("saknad revision på INNEHÅLLET är också okänd (t.ex. borttagen version)", async () => {
    telemetryRows.value = [telemetryRow("preflight_passed", REVISION_N)];
    versionRows.value = [{ filesRevision: null }];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("unknown");
  });

  it("ingen telemetri alls förblir fail-open null", async () => {
    telemetryRows.value = [];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.result).toBeNull();
    expect(signal.revisionMatch).toBe("unknown");
    // Ingen rad att jämföra mot → ingen anledning att läsa versionens revision.
    expect(versionRows.reads).toBe(0);
  });

  it("väljer den senaste raden för AKTUELLT innehåll, inte den senaste raden", async () => {
    // Ett repair-varv har skrivit ett pass för kandidaten i `repaired_files_json`
    // (nyare rad), medan versionen fortfarande håller basen som föll. Basens
    // verdikt är det som gäller innehållet — annars promotas basen på
    // kandidatens pass.
    telemetryRows.value = [
      telemetryRow("preflight_passed", REVISION_N),
      telemetryRow("verifier_failed", REVISION_N_PLUS_1),
    ];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("current");
    expect(signal.result).toBe("verifier_failed");
  });

  it("promotedFilesJson jämför mot innehållet som promotas, inte versionens bas (repair-accept)", async () => {
    const repaired = '[{"path":"app/page.tsx","content":"repaired"}]';
    telemetryRows.value = [telemetryRow("preflight_passed", md5(repaired))];
    // Versionsraden håller fortfarande basen — acceptRepair skriver `files_json`
    // i samma transaktion, EFTER guarden.
    versionRows.value = [{ filesRevision: REVISION_N }];

    const signal = await getLatestQualityGateSignalForVersion("ver_1", {
      promotedFilesJson: repaired,
    });

    expect(signal.revisionMatch).toBe("current");
    expect(signal.result).toBe("preflight_passed");
    // Ingen uppslagning mot versionens nuvarande innehåll behövdes.
    expect(versionRows.reads).toBe(0);
  });
});

describe("getLatestQualityGateSignalForVersion — flaggan AV", () => {
  beforeEach(() => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
    telemetryRows.value = [];
    versionRows.value = [{ filesRevision: REVISION_N_PLUS_1 }];
    versionRows.reads = 0;
  });

  it("är exakt dagens beteende: senaste radens verdikt, alltid okänd, ingen extra läsning", async () => {
    telemetryRows.value = [
      telemetryRow("preflight_passed", REVISION_N),
      telemetryRow("verifier_failed", REVISION_N),
    ];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.result).toBe("preflight_passed");
    expect(signal.revisionMatch).toBe("unknown");
    expect(versionRows.reads).toBe(0);
  });

  it("en känd mismatch är osynlig med flaggan av (ingen ny spärr smyger in)", async () => {
    telemetryRows.value = [telemetryRow("preflight_passed", REVISION_N)];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("unknown");
    expect(signal.result).toBe("preflight_passed");
  });
});
