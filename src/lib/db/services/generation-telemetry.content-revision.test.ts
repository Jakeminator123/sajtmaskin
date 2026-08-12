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
const chatSignalRows = vi.hoisted(() => ({
  value: [] as Record<string, unknown>[],
  reads: 0,
}));

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
    execute: async () => {
      chatSignalRows.reads += 1;
      return { rows: chatSignalRows.value };
    },
  },
}));

const {
  getLatestQualityGateSignalForVersion,
  getLatestQualityGateSignalsForChat,
} = await import("./generation-telemetry");

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

/**
 * Företrädesordningen mellan rader: den NYASTE raden avgör först.
 *
 * En revisionslös nyaste rad är `unknown`, och okänt behåller dagens
 * "senaste rad vinner". Att i det läget hämta upp en ÄLDRE rad som råkar
 * matcha innehållet vore att låta ett äldre verdikt gå före ett nyare på ett
 * antagande revisionen inte stöder — och det i BÅDA verdiktriktningarna
 * (ett gammalt passed får inte grönmåla, ett gammalt failed får inte blockera).
 */
describe("getLatestQualityGateSignalForVersion — nyaste revisionslösa rad har företräde", () => {
  beforeEach(() => {
    process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
    telemetryRows.value = [];
    versionRows.value = [{ filesRevision: REVISION_N_PLUS_1 }];
    versionRows.reads = 0;
  });

  afterEach(() => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  it("nyaste raden saknar revision → okänd vinner över en äldre matchande PASSED", async () => {
    telemetryRows.value = [
      telemetryRow("verifier_failed", null),
      telemetryRow("preflight_passed", REVISION_N_PLUS_1),
    ];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("unknown");
    expect(signal.result).toBe("verifier_failed");
  });

  it("nyaste raden saknar revision → okänd vinner över en äldre matchande FAILED", async () => {
    telemetryRows.value = [
      telemetryRow("preflight_passed", null),
      telemetryRow("verifier_failed", REVISION_N_PLUS_1),
    ];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("unknown");
    expect(signal.result).toBe("preflight_passed");
  });

  it("nyaste raden matchar innehållet → den är svaret, äldre rader läses inte om", async () => {
    telemetryRows.value = [
      telemetryRow("preflight_passed", REVISION_N_PLUS_1),
      telemetryRow("verifier_failed", REVISION_N_PLUS_1),
    ];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("current");
    expect(signal.result).toBe("preflight_passed");
  });

  it("nyaste raden är känd mismatch → en äldre rad som beskriver innehållet får svara", async () => {
    telemetryRows.value = [
      telemetryRow("verifier_failed", REVISION_N),
      telemetryRow("preflight_passed", REVISION_N_PLUS_1),
    ];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("current");
    expect(signal.result).toBe("preflight_passed");
  });

  it("bara mismatchade rader → känd mismatch, inget svar om innehållet", async () => {
    telemetryRows.value = [
      telemetryRow("preflight_passed", REVISION_N),
      telemetryRow("verifier_failed", REVISION_N),
    ];

    const signal = await getLatestQualityGateSignalForVersion("ver_1");

    expect(signal.revisionMatch).toBe("stale");
    expect(signal.contentRevision).toBe(REVISION_N_PLUS_1);
  });

  it("promotedFilesJson jämförs mot det innehåll som faktiskt promotas, inte mot radens", async () => {
    const promoted = '[{"path":"app/page.tsx","content":"promoted"}]';
    telemetryRows.value = [telemetryRow("preflight_passed", md5(promoted))];

    const signal = await getLatestQualityGateSignalForVersion("ver_1", {
      promotedFilesJson: promoted,
    });

    expect(signal.revisionMatch).toBe("current");
    // Ingen uppslagning av versionens nuvarande revision behövdes.
    expect(versionRows.reads).toBe(0);
  });
});

describe("getLatestQualityGateSignalsForChat — batch för /versions-listan", () => {
  beforeEach(() => {
    process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
    chatSignalRows.value = [];
    chatSignalRows.reads = 0;
  });

  afterEach(() => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  it("flaggan AV → tom map och noll DB-läsningar", async () => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
    chatSignalRows.value = [
      {
        versionId: "ver_1",
        latestResult: "preflight_passed",
        latestVerdictRevision: REVISION_N,
        contentRevision: REVISION_N_PLUS_1,
        matchingResult: null,
        matchingVerdictRevision: null,
      },
    ];

    const signals = await getLatestQualityGateSignalsForChat("chat_1");

    expect(signals.size).toBe(0);
    expect(chatSignalRows.reads).toBe(0);
  });

  it("känd mismatch på senaste raden → stale (inga äldre matchande rader)", async () => {
    chatSignalRows.value = [
      {
        versionId: "ver_1",
        latestResult: "preflight_passed",
        latestVerdictRevision: REVISION_N,
        contentRevision: REVISION_N_PLUS_1,
        matchingResult: null,
        matchingVerdictRevision: null,
      },
    ];

    const signals = await getLatestQualityGateSignalsForChat("chat_1");

    expect(chatSignalRows.reads).toBe(1);
    expect(signals.get("ver_1")?.revisionMatch).toBe("stale");
    expect(signals.get("ver_1")?.verdictRevision).toBe(REVISION_N);
    expect(signals.get("ver_1")?.contentRevision).toBe(REVISION_N_PLUS_1);
  });

  it("äldre rad som matchar innehållet vinner över stale latest (samma semantik som single)", async () => {
    chatSignalRows.value = [
      {
        versionId: "ver_1",
        latestResult: "verifier_failed",
        latestVerdictRevision: REVISION_N,
        contentRevision: REVISION_N_PLUS_1,
        matchingResult: "preflight_passed",
        matchingVerdictRevision: REVISION_N_PLUS_1,
      },
    ];

    const signals = await getLatestQualityGateSignalsForChat("chat_1");

    expect(signals.get("ver_1")?.revisionMatch).toBe("current");
    expect(signals.get("ver_1")?.result).toBe("preflight_passed");
  });

  it("saknad revision → unknown, aldrig mismatch", async () => {
    chatSignalRows.value = [
      {
        versionId: "ver_1",
        latestResult: "preflight_passed",
        latestVerdictRevision: null,
        contentRevision: REVISION_N_PLUS_1,
        matchingResult: null,
        matchingVerdictRevision: null,
      },
    ];

    const signals = await getLatestQualityGateSignalsForChat("chat_1");

    expect(signals.get("ver_1")?.revisionMatch).toBe("unknown");
  });
});
