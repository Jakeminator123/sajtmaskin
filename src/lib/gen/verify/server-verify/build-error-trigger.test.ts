import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `tryServerRepairLoop` flyttar raden till `repairing` innan den gör något
 * annat. Kraschar den utan att en samtidig användarredigering hunnit flytta
 * `files_json`, släpps leasen i `finally` medan inget sätter ett terminalt
 * tillstånd — versionen låg kvar i `repairing`. `triggerServerVerification`
 * har alltid parat stale-grenen med `failVersionVerification`; build-error-
 * vägen gjorde det inte.
 */

const failVersionVerification = vi.hoisted(() => vi.fn());
const getVersionFilesSnapshot = vi.hoisted(() => vi.fn());
const tryServerRepairLoop = vi.hoisted(() => vi.fn());
const triggerServerVerification = vi.hoisted(() => vi.fn());
const acquireVerifyLease = vi.hoisted(() => vi.fn());
const releaseVerifyLease = vi.hoisted(() => vi.fn());
const isLatestVersionForChat = vi.hoisted(() => vi.fn());
const isServerVerifyEligible = vi.hoisted(() => vi.fn());
const logQualityGateFailuresBestEffort = vi.hoisted(() => vi.fn());
const emitBusEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/chat-repository-pg", () => ({ failVersionVerification }));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFilesSnapshot }));
vi.mock("./repair-execution", () => ({ tryServerRepairLoop }));
vi.mock("./verify-run", () => ({ triggerServerVerification }));
vi.mock("./failures", () => ({ logQualityGateFailuresBestEffort }));
vi.mock("./lease", () => ({
  inflight: new Set<string>(),
  acquireVerifyLease,
  releaseVerifyLease,
  isLatestVersionForChat,
  isServerVerifyEligible,
}));
vi.mock("@/lib/logging/event-bus", () => ({ emit: emitBusEvent }));
vi.mock("@/lib/logging/event-bus-subscribers", () => ({}));
vi.mock("@/lib/logging/event-bus-error-log-sink", () => ({}));

import { triggerBuildErrorRepair } from "./build-error-trigger";

const chatId = "chat-be";
const versionId = "version-be";
const BASE_FILES_JSON = JSON.stringify([{ path: "app/page.tsx", content: "x" }]);

function snapshot(filesJson: string) {
  return {
    files: [{ path: "app/page.tsx", content: "x", language: "tsx" }],
    filesJson,
    lifecycleStage: "design",
  };
}

function run() {
  return triggerBuildErrorRepair({
    chatId,
    versionId,
    force: true,
    buildError: { stage: "next-build", message: "boom" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isServerVerifyEligible.mockReturnValue(true);
  isLatestVersionForChat.mockResolvedValue(true);
  acquireVerifyLease.mockResolvedValue({ proceed: true, runId: "run-1" });
  releaseVerifyLease.mockResolvedValue(undefined);
  failVersionVerification.mockResolvedValue(undefined);
  getVersionFilesSnapshot.mockResolvedValue(snapshot(BASE_FILES_JSON));
  triggerServerVerification.mockResolvedValue(undefined);
});

describe("triggerBuildErrorRepair — terminalt tillstånd efter krasch", () => {
  it("failar versionen när repair-loopen kraschar och filerna står kvar", async () => {
    tryServerRepairLoop.mockRejectedValue(new Error("repair exploded"));

    await run();

    expect(failVersionVerification).toHaveBeenCalledWith(
      versionId,
      "Server verification could not complete.",
      "run-1",
    );
    // Ingen redigering skedde, så ingen re-verify av B ska schemaläggas.
    expect(triggerServerVerification).not.toHaveBeenCalled();
    expect(releaseVerifyLease).toHaveBeenCalledWith(versionId, "run-1");
  });

  it("re-verifierar i stället för att faila när en redigering flyttat files_json", async () => {
    tryServerRepairLoop.mockRejectedValue(new Error("repair exploded"));
    getVersionFilesSnapshot
      .mockResolvedValueOnce(snapshot(BASE_FILES_JSON))
      .mockResolvedValueOnce(snapshot(JSON.stringify([{ path: "app/page.tsx", content: "B" }])));

    await run();

    // B får nå ett ärligt terminalt tillstånd på egna meriter — den får aldrig
    // failas från en överkörd repair av A.
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(triggerServerVerification).toHaveBeenCalledWith(
      expect.objectContaining({ chatId, versionId, forceBuildCheck: true }),
    );
  });

  it("failar inte en version som aldrig nådde repair-loopen", async () => {
    // Kastet kom före `repairing` — raden är orörd och ett fail vore ett nytt
    // falskt rött.
    getVersionFilesSnapshot.mockRejectedValue(new Error("db hiccup"));

    await run();

    expect(tryServerRepairLoop).not.toHaveBeenCalled();
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(triggerServerVerification).not.toHaveBeenCalled();
  });

  it("startar inget arbete när leasen inte kan bevisas (DB-fel)", async () => {
    acquireVerifyLease.mockResolvedValue({ proceed: false, reason: "lease_unavailable" });

    const outcome = await run();

    expect(outcome).toEqual({
      started: false,
      repairAvailable: false,
      skippedReason: "lease_unavailable",
    });
    expect(getVersionFilesSnapshot).not.toHaveBeenCalled();
    expect(tryServerRepairLoop).not.toHaveBeenCalled();
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(releaseVerifyLease).not.toHaveBeenCalled();
  });

  it("lämnar ett lyckat utfall orört", async () => {
    tryServerRepairLoop.mockResolvedValue({
      supersededByUserEdit: false,
      buildOriginated: true,
    });

    const outcome = await run();

    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(outcome.started).toBe(true);
  });
});
