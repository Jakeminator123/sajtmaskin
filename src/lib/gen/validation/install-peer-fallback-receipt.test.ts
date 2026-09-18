import { describe, expect, it } from "vitest";
import {
  INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY,
  installPeerFallbackReceiptBlocksPublish,
  previewInstallKindFromHostStatus,
  readInstallPeerFallbackReceiptKind,
} from "./install-peer-fallback-receipt";

function receipt(
  usedFallback: boolean,
  filesRevision: string | null,
  kind?: "fallback" | "strict_pass" | "skipped",
) {
  return {
    category: INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY,
    meta: {
      usedFallback,
      filesRevision,
      ...(kind ? { kind } : {}),
    },
  };
}

describe("installPeerFallbackReceiptBlocksPublish", () => {
  it("blocks while the latest receipt for this revision is a fallback", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [
          receipt(true, "rev-a", "fallback"),
        ],
        "rev-a",
      ),
    ).toBe(true);
  });

  it("stays blocked after a later clean quality-gate pass (different category)", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [
          {
            category: "preflight:quality-gate",
            meta: { passed: true, advisory: false, advisoryChecks: [] },
          },
          receipt(true, "rev-a", "fallback"),
        ],
        "rev-a",
      ),
    ).toBe(true);
  });

  it("clears only when the same revision later records a strict_pass", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [receipt(false, "rev-a", "strict_pass"), receipt(true, "rev-a", "fallback")],
        "rev-a",
      ),
    ).toBe(false);
  });

  it("does not clear when a later skip writes usedFallback:false without strict_pass", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [receipt(false, "rev-a", "skipped"), receipt(true, "rev-a", "fallback")],
        "rev-a",
      ),
    ).toBe(true);
  });

  it("does not treat a legacy usedFallback:false receipt as a strict pass", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [receipt(false, "rev-a"), receipt(true, "rev-a", "fallback")],
        "rev-a",
      ),
    ).toBe(true);
  });

  it("does not apply a previous revision's fallback to a new files revision", () => {
    expect(installPeerFallbackReceiptBlocksPublish([receipt(true, "rev-a")], "rev-b")).toBe(
      false,
    );
  });

  it("fail-closes when current revision is missing but a fallback receipt exists", () => {
    expect(installPeerFallbackReceiptBlocksPublish([receipt(true, "rev-a")])).toBe(true);
  });
});

describe("readInstallPeerFallbackReceiptKind", () => {
  it("prefers explicit kind over the boolean", () => {
    expect(readInstallPeerFallbackReceiptKind({ kind: "strict_pass", usedFallback: false })).toBe(
      "strict_pass",
    );
    expect(readInstallPeerFallbackReceiptKind({ kind: "skipped", usedFallback: false })).toBe(
      "skipped",
    );
    expect(readInstallPeerFallbackReceiptKind({ usedFallback: true })).toBe("fallback");
    expect(readInstallPeerFallbackReceiptKind({ usedFallback: false })).toBe("skipped");
  });
});

describe("previewInstallKindFromHostStatus", () => {
  it("keeps skipped distinct from a missing strict proof", () => {
    expect(previewInstallKindFromHostStatus({ installKind: "skipped" })).toBe("skipped");
    expect(previewInstallKindFromHostStatus({ installKind: "strict_pass" })).toBe("strict_pass");
    expect(
      previewInstallKindFromHostStatus({
        usedLegacyPeerDeps: true,
        peerConflictDetected: true,
      }),
    ).toBe("fallback");
    expect(
      previewInstallKindFromHostStatus({
        usedLegacyPeerDeps: false,
        peerConflictDetected: false,
      }),
    ).toBeNull();
  });
});
