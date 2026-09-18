import { describe, expect, it } from "vitest";
import { INCIDENT_V0_PACKAGE_JSON } from "@/lib/gen/validation/package-tree-compat";
import {
  DEPLOY_INSTALL_PEER_FALLBACK,
  DEPLOY_PACKAGE_TREE_ERESOLVE,
  resolveInstallPeerFallbackGate,
  resolvePackageTreePublishGate,
} from "./package-tree-publish-gate";

const incidentFiles = [
  {
    path: "package.json",
    content: `${JSON.stringify(INCIDENT_V0_PACKAGE_JSON, null, 2)}\n`,
  },
];

describe("resolvePackageTreePublishGate", () => {
  it("blocks publish on the incident Next 14 + React 19 tree", () => {
    const gate = resolvePackageTreePublishGate({ files: incidentFiles });
    expect(gate.allowed).toBe(false);
    if (gate.allowed) return;
    expect(gate.code).toBe(DEPLOY_PACKAGE_TREE_ERESOLVE);
    expect(gate.message).toMatch(/14\.2\.25/);
    expect(gate.message).toMatch(/\^19/);
  });

  it("blocks publish when preview only started after legacy-peer-deps", () => {
    const gate = resolveInstallPeerFallbackGate(["install-peer-fallback"]);
    expect(gate).toMatchObject({
      allowed: false,
      code: DEPLOY_INSTALL_PEER_FALLBACK,
    });
  });

  it("prefers the durable file conflict over the fallback advisory", () => {
    const gate = resolvePackageTreePublishGate({
      files: incidentFiles,
      latestGateAdvisoryChecks: ["install-peer-fallback"],
    });
    expect(gate.allowed).toBe(false);
    if (gate.allowed) return;
    expect(gate.code).toBe(DEPLOY_PACKAGE_TREE_ERESOLVE);
  });

  it("keeps blocking after a later clean quality-gate when the revision receipt is fallback", () => {
    const gate = resolvePackageTreePublishGate({
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            dependencies: { next: "15.5.4", react: "^19.1.0", "react-dom": "^19.1.0" },
          }),
        },
      ],
      latestGateAdvisoryChecks: [],
      filesRevision: "rev-a",
      errorLogs: [
        {
          category: "preflight:quality-gate",
          meta: { passed: true, advisory: false, advisoryChecks: [] },
        },
        {
          category: "preview:install-peer-fallback",
          meta: { usedFallback: true, filesRevision: "rev-a" },
        },
      ],
    });
    expect(gate.allowed).toBe(false);
    if (gate.allowed) return;
    expect(gate.code).toBe(DEPLOY_INSTALL_PEER_FALLBACK);
  });

  it("allows a coherent Next 15 + React 19 tree", () => {
    const gate = resolvePackageTreePublishGate({
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            dependencies: { next: "15.5.4", react: "^19.1.0", "react-dom": "^19.1.0" },
          }),
        },
      ],
    });
    expect(gate).toEqual({ allowed: true });
  });
});
