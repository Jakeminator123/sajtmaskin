import { describe, expect, it } from "vitest";
import {
  INCIDENT_V0_PACKAGE_JSON,
  detectPackageTreeConflicts,
  extractDependencyMajor,
  findPackageTreeConflictsInFiles,
  formatPackageTreeConflictDetail,
} from "./package-tree-compat";

const INCIDENT_PACKAGE_JSON_TEXT = `${JSON.stringify(INCIDENT_V0_PACKAGE_JSON, null, 2)}\n`;

describe("extractDependencyMajor", () => {
  it("reads caret, exact and comparator ranges", () => {
    expect(extractDependencyMajor("^19")).toBe(19);
    expect(extractDependencyMajor("14.2.25")).toBe(14);
    expect(extractDependencyMajor(">=18.2.0")).toBe(18);
  });
});

describe("detectPackageTreeConflicts — incident fixture", () => {
  it("flags the imported v0 tree next@14.2.25 + react@^19", () => {
    const conflicts = detectPackageTreeConflicts(INCIDENT_V0_PACKAGE_JSON);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      code: "next_react_peer_eresolve",
      nextRange: "14.2.25",
      reactRange: "^19",
      nextMajor: 14,
      reactMajor: 19,
      peers: {
        next: "14.2.25",
        react: "^19",
        reactDom: "^19",
        typesReact: "^18",
        typesReactDom: "^18",
      },
    });
    expect(conflicts[0]?.message).toMatch(/ERESOLVE/);
    expect(conflicts[0]?.message).toMatch(/legacy-peer-deps/);
    expect(conflicts[0]?.repairOptions.some((option) => /Bump Next/i.test(option))).toBe(true);
    expect(conflicts[0]?.repairOptions.some((option) => /Pin React 18/i.test(option))).toBe(
      true,
    );
    expect(conflicts[0]?.repairOptions.some((option) => /do not publish/i.test(option))).toBe(
      true,
    );
  });

  it("locks the fixture text to the incident package.json", () => {
    expect(INCIDENT_PACKAGE_JSON_TEXT).toContain('"next": "14.2.25"');
    expect(INCIDENT_PACKAGE_JSON_TEXT).toContain('"react": "^19"');
    expect(INCIDENT_PACKAGE_JSON_TEXT).toContain('"react-dom": "^19"');
    expect(INCIDENT_PACKAGE_JSON_TEXT).toContain('"@types/react": "^18"');
    const found = findPackageTreeConflictsInFiles([
      { path: "package.json", content: INCIDENT_PACKAGE_JSON_TEXT },
    ]);
    expect(found?.conflicts).toHaveLength(1);
    expect(formatPackageTreeConflictDetail(found!.conflicts[0]!)).toMatch(/@types\/react \^18/);
  });

  it("does not flag Next 15 + React 19 or Next 14 + React 18", () => {
    expect(
      detectPackageTreeConflicts({
        dependencies: { next: "15.5.4", react: "^19", "react-dom": "^19" },
      }),
    ).toEqual([]);
    expect(
      detectPackageTreeConflicts({
        dependencies: { next: "14.2.25", react: "^18.2.0", "react-dom": "^18.2.0" },
      }),
    ).toEqual([]);
  });

  it("still flags Next 16 + React 18 (the existing reverse ERESOLVE)", () => {
    const conflicts = detectPackageTreeConflicts({
      dependencies: { next: "16.2.3", react: "18.3.1" },
    });
    expect(conflicts[0]?.nextMajor).toBe(16);
    expect(conflicts[0]?.reactMajor).toBe(18);
  });
});
