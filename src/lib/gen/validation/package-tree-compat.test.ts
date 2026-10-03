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
    expect(conflicts[0]?.repairOptions.some((option) => /Pin React 18/i.test(option))).toBe(true);
    expect(conflicts[0]?.repairOptions.some((option) => /do not publish/i.test(option))).toBe(true);
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

  it("does not invent a Next 16 + React 18 conflict (Next still peers React 18)", () => {
    const conflicts = detectPackageTreeConflicts({
      dependencies: { next: "16.2.3", react: "18.3.1" },
    });
    expect(conflicts).toEqual([]);
  });

  it.each([
    [">=14 <16", "^19"],
    ["14 || 15", "^19"],
    ["14.2.25", "^18.2 || ^19"],
    ["14.2.25", "*"],
    ["latest", "^19"],
    ["github:org/next#v14", "^19"],
  ])("does not claim ERESOLVE without proof for Next %s and React %s", (next, react) => {
    expect(detectPackageTreeConflicts({ dependencies: { next, react } })).toEqual([]);
  });

  it("uses in-range lockfile selections, not the first major of a broad declaration", () => {
    const files = [
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { next: ">=14 <16", react: "^19" } }),
      },
      {
        path: "package-lock.json",
        content: JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "node_modules/next": { version: "14.2.25" },
            "node_modules/react": { version: "19.0.0" },
          },
        }),
      },
    ];
    expect(findPackageTreeConflictsInFiles(files)?.conflicts[0]?.nextMajor).toBe(14);
    files[1].content = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "node_modules/next": { version: "15.5.4" },
        "node_modules/react": { version: "19.0.0" },
      },
    });
    expect(findPackageTreeConflictsInFiles(files)).toBeNull();
  });

  it("detects a locked React 19 selection inside a mixed 18/19 range", () => {
    expect(
      findPackageTreeConflictsInFiles([
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { next: "14.2.25", react: "^18.2 || ^19" } }),
        },
        {
          path: "package-lock.json",
          content: JSON.stringify({
            lockfileVersion: 1,
            dependencies: {
              next: { version: "14.2.25" },
              react: { version: "19.0.0" },
            },
          }),
        },
      ])?.conflicts[0]?.reactMajor,
    ).toBe(19);
  });

  it("ignores out-of-range lock selections rather than clearing a manifest conflict", () => {
    expect(
      findPackageTreeConflictsInFiles([
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { next: "14.2.25", react: "^19" } }),
        },
        {
          path: "package-lock.json",
          content: JSON.stringify({
            packages: {
              "node_modules/next": { version: "15.5.4" },
              "node_modules/react": { version: "18.3.1" },
            },
          }),
        },
      ])?.conflicts,
    ).toHaveLength(1);
  });
  it("keeps root-only default lookup but accepts an explicitly selected src manifest", () => {
    const files = [{ path: "src/package.json", content: INCIDENT_PACKAGE_JSON_TEXT }];
    expect(findPackageTreeConflictsInFiles(files)).toBeNull();
    expect(findPackageTreeConflictsInFiles(files, "src/package.json")).toMatchObject({
      path: "src/package.json", conflicts: [{ code: "next_react_peer_eresolve" }],
    });
  });
  it("uses the lock next to the selected src manifest, not an unrelated root lock", () => {
    const lock = (next: string) => JSON.stringify({ packages: {
      "node_modules/next": { version: next }, "node_modules/react": { version: "19.0.0" },
    } });
    expect(findPackageTreeConflictsInFiles([
      { path: "src/package.json", content: JSON.stringify({ dependencies: { next: ">=14 <16", react: "^19" } }) },
      { path: "package-lock.json", content: lock("15.5.4") },
      { path: "src/package-lock.json", content: lock("14.2.25") },
    ], "src/package.json")?.conflicts).toHaveLength(1);
  });
});
