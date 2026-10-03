import { describe, expect, it } from "vitest";
import { satisfies } from "semver";
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
    expect(conflicts[0]?.repairOptions.some((option) => /Pin Next.*exact.*React.*react-dom.*peer range/i.test(option))).toBe(true);
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
    ["11.1.4", "19.0.0"], ["16.2.3", "17.0.2"],
    ["10.2.3", "19.0.0"], ["9.5.5", "19.0.0"],
    ["4.0.0", "19.0.0"], ["15.0.0", "19.0.0"],
  ])("retains published peer rejection outside Next 12-14 for %s/%s", (next, react) => {
    expect(detectPackageTreeConflicts({ dependencies: { next, react } })[0]?.code).toBe("next_react_peer_eresolve");
    expect(detectPackageTreeConflicts({ dependencies: { next: `^${next}`, react } }, { next, react })[0]?.code).toBe("next_react_peer_eresolve");
  });

  it("preserves the React 18.0 contract of an exact Next 13.0.0 choice", () => {
    expect(detectPackageTreeConflicts({ dependencies: { next: "13.0.0", react: "18.0.0" } })).toEqual([]);
  });
  it.each(["^13.0.0", "13 || 14", "12.0.0 || 13.0.1"])("requires resolution evidence rather than one historical compatible Next contract for %s", (next) => {
    const conflict = detectPackageTreeConflicts({ dependencies: { next, react: next.startsWith("12") ? "17.0.2" : "18.0.0" } })[0];
    expect(conflict?.code).toBe("next_react_peer_resolution_required");
    expect(conflict?.message).toMatch(/lockfile|exact/i);
    expect(conflict?.message).not.toContain("is an npm ERESOLVE tree");
  });
  it("requires evidence for mixed React choices but allows compatible choices or an in-range exact lock", () => {
    expect(detectPackageTreeConflicts({ dependencies: { next: "14.2.25", react: "^18.2 || ^19" } })[0]?.code).toBe("next_react_peer_resolution_required");
    expect(detectPackageTreeConflicts({ dependencies: { next: "14.2.25", react: "*" } })[0]?.code).toBe("next_react_peer_resolution_required");
    expect(detectPackageTreeConflicts({ dependencies: { next: "^13.0.0", react: "^18.2.0" } })).toEqual([]);
    expect(detectPackageTreeConflicts({ dependencies: { next: "^13.0.0", react: "18.0.0" } }, { next: "13.0.0", react: "18.0.0" })).toEqual([]);
    expect(detectPackageTreeConflicts({ dependencies: { next: "14.2.25", react: "^18.2 || ^19" } }, { next: "14.2.25", react: "18.3.1" })).toEqual([]);
  });

  it("still rejects React 18.0 when the selected Next excludes 13.0.0", () => {
    expect(detectPackageTreeConflicts({ dependencies: { next: "13.0.1", react: "18.0.0" } })).toHaveLength(1);
    expect(detectPackageTreeConflicts({ dependencies: { next: "^13.0.0", react: "18.0.0" } }, { next: "13.0.1", react: "18.0.0" })).toHaveLength(1);
    expect(detectPackageTreeConflicts({ dependencies: { next: "13.0.0", react: "^19" } })[0]?.message).toContain("ERESOLVE");
  });

  it.each(["18.0.0-rc.0", "^18.0.0-rc.0", ">=18.0.0-rc.0 <18.0.0"])("admits prerelease React %s under the published Next 13.0.0 peer", (react) => {
    expect(detectPackageTreeConflicts({ dependencies: { next: "13.0.0", react } })).toEqual([]);
  });
  it("validates an exact locked prerelease with normal npm prerelease admission", () => {
    expect(detectPackageTreeConflicts({ dependencies: { next: "13.0.0", react: "^18.0.0-rc.0" } }, { next: "13.0.0", react: "18.0.0-rc.0" })).toEqual([]);
    expect(detectPackageTreeConflicts({ dependencies: { next: "13.0.1", react: "18.3.0-rc.0" } })).toHaveLength(1);
    expect(detectPackageTreeConflicts({ dependencies: { next: "13.0.0", react: ">=17 <18.0.0" } })).toHaveLength(1);
  });
  it("preserves known Next 12 peer conflicts without rejecting supported React 17/18", () => {
    expect(detectPackageTreeConflicts({ dependencies: { next: "12.3.4", react: "^19" } })).toHaveLength(1);
    expect(detectPackageTreeConflicts({ dependencies: { next: "12 || 13", react: "^19" } })).toHaveLength(1);
    for (const react of ["17.0.2", "18.0.0", "18.0.0-rc.0"]) {
      expect(detectPackageTreeConflicts({ dependencies: { next: "12.3.4", react } })).toEqual([]);
    }
    expect(detectPackageTreeConflicts({ dependencies: { next: ">=12 <16", react: "^19" } })[0]?.code).toBe("next_react_peer_resolution_required");
    expect(detectPackageTreeConflicts({ dependencies: { next: ">=12 <16", react: "^19" } }, { next: "12.3.4", react: "19.0.0" })).toHaveLength(1);
  });
  it("matches published exact peers across stable/prerelease boundary fixtures", () => {
    const contracts = [
      ["2.0.0", "^15.4.2"], ["3.0.1", "^15.4.2"], ["3.0.2", "^15.5.4"],
      ["4.0.0", "^16.0.0"], ["7.0.0", "^16.0.0"], ["8.0.0", "^16.6.0"],
      ["9.5.5", "^16.6.0"], ["10.0.0", "^16.6.0 || ^17"], ["11.1.4", "^17.0.2"],
      ["12.0.0", "^17.0.2"],
      ["12.0.1", "^17.0.2 || ^18.0.0"],
      ["12.0.4", "^17.0.2 || ^18.0.0"],
      ["12.0.5", "^17.0.2 || ^18.0.0-0"],
      ["12.3.4", "^17.0.2 || ^18.0.0-0"],
      ["13.0.0", "^18.0.0-0"],
      ["13.0.1", "^18.2.0"],
      ["14.2.25", "^18.2.0"],
      ["15.0.0", "^18.2.0 || 19.0.0-rc-65a56d0e-20241020"],
      ["15.0.1", "^18.2.0 || 19.0.0-rc-69d4b800-20241021"],
      ["15.0.2", "^18.2.0 || 19.0.0-rc-02c0e824-20241028"],
      ["15.0.3", "^18.2.0 || 19.0.0-rc-66855b96-20241106"],
      ["15.0.4", "^18.2.0 || 19.0.0-rc-66855b96-20241106 || ^19.0.0"],
      ["15.1.0", "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0"],
      ["16.2.3", "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0"],
      ["16.3.8", "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0"],
    ];
    const versions = ["15.4.1", "15.4.2", "15.5.4", "16.0.0", "16.6.0", "16.14.0", "17.0.0", "17.0.1", "17.0.2", "17.0.3", "18.0.0-0", "18.0.0-rc.0", "18.0.0", "18.1.0", "18.2.0", "18.3.0-rc.0", "18.3.0", "19.0.0-rc.0", "19.0.0-rc-65a56d0e-20241020", "19.0.0-rc-69d4b800-20241021", "19.0.0-rc-02c0e824-20241028", "19.0.0-rc-66855b96-20241106", "19.0.0-rc-de68d2f4-20241204", "19.0.0"];
    for (const [next, peer] of contracts) {
      for (const react of versions) {
        expect(detectPackageTreeConflicts({ dependencies: { next, react } }), `${next}/${react}`).toHaveLength(satisfies(react, peer) ? 0 : 1);
      }
    }
  });
  it("does not advertise pinning only React against a cross-contract peer union", () => {
    const conflict = detectPackageTreeConflicts({ dependencies: { next: "12.0.0 || 13.0.1", react: "19.0.0" } })[0]!;
    expect(conflict.repairOptions[1]).toMatch(/Pin Next.*exact.*React.*react-dom.*peer range/i);
    expect(conflict.repairOptions[1]).not.toMatch(/^Pin React 17/);
  });

  it.each([
    ["latest", "^19"],
    ["github:org/next#v14", "^19"],
    ["^17.0.0", "^19"],
  ])("does not claim ERESOLVE without proof for Next %s and React %s", (next, react) => {
    expect(detectPackageTreeConflicts({ dependencies: { next, react } })).toEqual([]);
  });
  it.each([">=14 <16", "14 || 15", "15.0.0 || 15.0.4"])("requires resolution evidence, not an ERESOLVE claim, for %s", (next) => {
    const conflict = detectPackageTreeConflicts({ dependencies: { next, react: "^19" } })[0];
    expect(conflict?.code).toBe("next_react_peer_resolution_required");
    expect(conflict?.message).not.toContain("is an npm ERESOLVE tree");
    expect(detectPackageTreeConflicts({ dependencies: { next, react: "^19" } }, { next: "15.0.4", react: "19.0.0" })).toEqual([]);
  });
  it.each([">=14", "14 || >=17", "*", ">=14 <18"])("requires evidence for the unknown tail of %s, without inventing ERESOLVE", (next) => {
    for (const react of ["17.0.2", "18.2.0", "19.0.0"]) {
      const conflicts = detectPackageTreeConflicts({ dependencies: { next, react } });
      expect(conflicts[0]?.code).toBe("next_react_peer_resolution_required");
      expect(conflicts[0]?.message).not.toContain("is an npm ERESOLVE tree");
    }
    expect(detectPackageTreeConflicts({ dependencies: { next, react: "18.2.0" } }, { next: "14.2.25", react: "18.2.0" })).toEqual([]);
    expect(detectPackageTreeConflicts({ dependencies: { next, react: "17.0.2" } }, { next: "14.2.25", react: "17.0.2" })[0]?.code).toBe("next_react_peer_eresolve");
  });
  it("does not invent a peer contract for Next 0/1 before React peers were declared", () => {
    expect(detectPackageTreeConflicts({ dependencies: { next: "1.2.3", react: "19.0.0" } })).toEqual([]);
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
  it.each([
    ["pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      next:\n        specifier: ^13.0.0\n        version: 13.0.0(react@18.0.0)\n      react:\n        specifier: 18.0.0\n        version: 18.0.0\n"],
    ["pnpm-lock.yaml", "lockfileVersion: 5.4\nspecifiers:\n  next: ^13.0.0\n  react: 18.0.0\ndependencies:\n  next: 13.0.0_react@18.0.0\n  react: 18.0.0\n"],
    ["yarn.lock", '# yarn lockfile v1\n\n"next@^13.0.0":\n  version "13.0.0"\n\nreact@18.0.0:\n  version "18.0.0"\n'],
    ["yarn.lock", '__metadata:\n  version: 6\n"next@npm:^13.0.0":\n  version: 13.0.0\n"react@npm:18.0.0":\n  version: 18.0.0\n'],
  ])("honors coherent sibling %s selections, including a src manifest", (lockPath, content) => {
    for (const folder of ["", "src/"]) {
      const files = [{ path: `${folder}package.json`, content: JSON.stringify({ dependencies: { next: "^13.0.0", react: "18.0.0" } }) }, { path: `${folder}${lockPath}`, content }];
      expect(findPackageTreeConflictsInFiles(files, `${folder}package.json`)).toBeNull();
      expect(findPackageTreeConflictsInFiles([files[0]], `${folder}package.json`)?.conflicts[0]?.code).toBe("next_react_peer_resolution_required");
    }
  });
  it("uses the effective pnpm lock instead of an inactive npm lock and preserves locked conflicts", () => {
    const files = [
      { path: "package.json", content: JSON.stringify({ packageManager: "pnpm@9.0.0", dependencies: { next: "^13.0.0", react: "18.0.0" } }) },
      { path: "pnpm-lock.yaml", content: "specifiers:\n  next: ^13.0.0\n  react: 18.0.0\ndependencies:\n  next: 13.0.0\n  react: 18.0.0\n" },
      { path: "package-lock.json", content: JSON.stringify({ packages: { "node_modules/next": { version: "13.0.1" }, "node_modules/react": { version: "18.0.0" } } }) },
    ];
    expect(findPackageTreeConflictsInFiles(files)).toBeNull();
    files[1].content = "specifiers:\n  next: ^13.0.0\n  react: 18.0.0\ndependencies:\n  next: 13.0.1\n  react: 18.0.0\n";
    expect(findPackageTreeConflictsInFiles(files)?.conflicts[0]?.code).toBe("next_react_peer_eresolve");
  });
  it.each(["next", "react"])("does not clear uncertainty using a stale pnpm importer %s specifier", (stale) => {
    const files = [{ path: "package.json", content: JSON.stringify({ dependencies: { next: "^13.0.0", react: "18.0.0" } }) }, {
      path: "pnpm-lock.yaml", content: `importers:\n  .:\n    dependencies:\n      next:\n        specifier: ${stale === "next" ? "13.0.0" : "^13.0.0"}\n        version: 13.0.0\n      react:\n        specifier: ${stale === "react" ? "^18.0.0" : "18.0.0"}\n        version: 18.0.0\n`,
    }];
    expect(findPackageTreeConflictsInFiles(files)?.conflicts[0]?.code).toBe("next_react_peer_resolution_required");
  });
  it.each([
    "dependencies:\n  next: 13.0.0\n  react: 18.0.0\n",
    "specifiers:\n  next: 13.0.0\n  react: 18.0.0\ndependencies:\n  next: 13.0.0\n  react: 18.0.0\n",
    "importers:\n  .:\n    devDependencies:\n      next:\n        specifier: ^13.0.0\n        version: 13.0.0\n      react:\n        specifier: 18.0.0\n        version: 18.0.0\n",
  ])("requires current manifest specifiers and dependency fields for legacy/modern pnpm evidence", (content) => {
    expect(findPackageTreeConflictsInFiles([
      { path: "package.json", content: JSON.stringify({ dependencies: { next: "^13.0.0", react: "18.0.0" } }) },
      { path: "pnpm-lock.yaml", content },
    ])?.conflicts[0]?.code).toBe("next_react_peer_resolution_required");
  });
  it.each([
    ["pnpm-lock.yml", "specifiers:\n  next: ^13.0.0\n  react: 18.0.0\ndependencies:\n  next: 13.0.0\n  react: 18.0.0\n"],
    ["pnpm-lock.yaml", "dependencies:\n  next: 12.3.4\n  react: 18.0.0\n"],
    ["pnpm-lock.yaml", "importers:\n  other:\n    dependencies:\n      next: 13.0.0\n      react: 18.0.0\n"],
    ["pnpm-lock.yaml", "dependencies: !!js/object { next: 13.0.0, react: 18.0.0 }\n"],
    ["pnpm-lock.yaml", "dependencies:\n  next: 13.0.0\n  next: 13.0.1\n  react: 18.0.0\n"],
    ["pnpm-lock.yaml", "versions: &v 13.0.0\ndependencies:\n  next: *v\n  react: 18.0.0\n"],
    ["yarn.lock", '"next@^12.0.0":\n  version "13.0.0"\nreact@18.0.0:\n  version "18.0.0"\n'],
    ["yarn.lock", '"next@^13.0.0":\n  version "13.0.0"\n"next@^13.0.0":\n  version "13.0.1"\nreact@18.0.0:\n  version "18.0.0"\n'],
  ])("does not use stale, unrelated, ambiguous or unsafe %s evidence", (path, content) => {
    expect(findPackageTreeConflictsInFiles([
      { path: "package.json", content: JSON.stringify({ dependencies: { next: "^13.0.0", react: "18.0.0" } }) }, { path, content },
    ])?.conflicts[0]?.code).toBe("next_react_peer_resolution_required");
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
