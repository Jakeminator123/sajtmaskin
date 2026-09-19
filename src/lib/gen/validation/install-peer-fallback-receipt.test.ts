import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  INSTALL_DEPENDENCY_POLICY_TOKEN,
  INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY,
  dependencyFingerprintFromFiles,
  installPeerFallbackReceiptBlocksPublish,
  previewInstallKindFromHostStatus,
  readInstallPeerFallbackReceiptKind,
} from "./install-peer-fallback-receipt";

function receipt(
  usedFallback: boolean,
  filesRevision: string | null,
  kind?: "fallback" | "strict_pass" | "skipped",
  dependencyFingerprint?: string | null,
) {
  return {
    category: INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY,
    meta: {
      usedFallback,
      filesRevision,
      ...(kind ? { kind } : {}),
      ...(dependencyFingerprint !== undefined ? { dependencyFingerprint } : {}),
    },
  };
}

const PACKAGE_A = JSON.stringify({
  dependencies: { next: "14.2.25", react: "^19.1.0", "react-dom": "^19.1.0" },
});
const PACKAGE_B = JSON.stringify({
  dependencies: { next: "15.5.4", react: "^19.1.0", "react-dom": "^19.1.0" },
});
const filesTreeA = [
  { path: "package.json", content: PACKAGE_A },
  { path: "app/page.tsx", content: "export default function Page() { return <h1>A</h1>; }" },
];
const filesTreeACopyEdit = [
  { path: "package.json", content: PACKAGE_A },
  { path: "app/page.tsx", content: "export default function Page() { return <h1>B</h1>; }" },
];
const filesTreeB = [
  { path: "package.json", content: PACKAGE_B },
  { path: "app/page.tsx", content: "export default function Page() { return <h1>B</h1>; }" },
];

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

  it("keeps a fallback block across a page.tsx-only files_revision change", () => {
    const fingerprint = dependencyFingerprintFromFiles(filesTreeA);
    expect(dependencyFingerprintFromFiles(filesTreeACopyEdit)).toBe(fingerprint);
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [
          {
            category: "preflight:quality-gate",
            meta: { passed: true, advisory: false, advisoryChecks: [] },
          },
          receipt(false, "rev-b", "skipped", fingerprint),
          receipt(true, "rev-a", "fallback", fingerprint),
        ],
        { filesRevision: "rev-b", files: filesTreeACopyEdit },
      ),
    ).toBe(true);
  });

  it("requires new install proof after package.json changes the fingerprint", () => {
    const fingerprintA = dependencyFingerprintFromFiles(filesTreeA);
    expect(dependencyFingerprintFromFiles(filesTreeB)).not.toBe(fingerprintA);
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [receipt(true, "rev-a", "fallback", fingerprintA)],
        { filesRevision: "rev-b", files: filesTreeB },
      ),
    ).toBe(false);
  });

  it("inherits unfingerprinted legacy fallback onto the current fingerprint until a fingerprinted strict_pass", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [receipt(true, "rev-a", "fallback")],
        { filesRevision: "rev-b", files: filesTreeACopyEdit },
      ),
    ).toBe(true);
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [
          receipt(false, "rev-b", "strict_pass", dependencyFingerprintFromFiles(filesTreeACopyEdit)),
          receipt(true, "rev-a", "fallback"),
        ],
        { filesRevision: "rev-b", files: filesTreeACopyEdit },
      ),
    ).toBe(false);
  });

  it("does not let an unfingerprinted strict_pass clear a legacy fallback", () => {
    expect(
      installPeerFallbackReceiptBlocksPublish(
        [receipt(false, "rev-b", "strict_pass"), receipt(true, "rev-a", "fallback")],
        { filesRevision: "rev-b", files: filesTreeACopyEdit },
      ),
    ).toBe(true);
  });
});

describe("dependencyFingerprintFromFiles", () => {
  it("matches preview-host: policy token + package.json/lockfile keys only", () => {
    const files = [
      { path: "package.json", content: PACKAGE_A },
      { path: "package-lock.json", content: "{lock:1}" },
      { path: "app/page.tsx", content: "ignored" },
    ];
    const expected = createHash("sha256");
    expected.update("policy:");
    expected.update(INSTALL_DEPENDENCY_POLICY_TOKEN);
    expected.update("\n");
    expected.update("package.json\n");
    expected.update(`${PACKAGE_A}\n`);
    expected.update("package-lock.json\n");
    expected.update("{lock:1}\n");
    expect(dependencyFingerprintFromFiles(files)).toBe(expected.digest("hex"));
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
