import { describe, expect, it } from "vitest";
import {
  INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY,
  installPeerFallbackReceiptBlocksPublish,
} from "./install-peer-fallback-receipt";

function receipt(usedFallback: boolean, filesRevision: string | null) {
  return {
    category: INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY,
    meta: { usedFallback, filesRevision },
  };
}

describe("installPeerFallbackReceiptBlocksPublish", () => {
  it("blocks while the latest receipt for this revision is a fallback", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [
          receipt(true, "rev-a"),
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
          receipt(true, "rev-a"),
        ],
        "rev-a",
      ),
    ).toBe(true);
  });

  it("clears only when the same revision later records a strict install", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [receipt(false, "rev-a"), receipt(true, "rev-a")],
        "rev-a",
      ),
    ).toBe(false);
  });

  it("does not apply a previous revision's fallback to a new files revision", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish([receipt(true, "rev-a")], "rev-b"),
    ).toBe(false);
  });

  it("fail-closes when current revision is missing but a fallback receipt exists", () => {
    expect(installPeerFallbackReceiptBlocksPublish([receipt(true, "rev-a")])).toBe(true);
  });
});
