import { describe, expect, it } from "vitest";

import {
  changedDirectDependencies,
  matchesAllowedPackage,
  parseDependencyNames,
  validateLockChanges,
  validateManifestChanges,
  validateSnapshot,
} from "./dependabot-automerge.mjs";

const allowed = ["@radix-ui/*", "nanoid", "swr", "child"];

type LockEntry = {
  version?: string;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
  hasInstallScript?: boolean;
  [key: string]: unknown;
};

type LockFixture = {
  name: string;
  lockfileVersion: number;
  requires: boolean;
  packages: Record<string, LockEntry>;
};

function pkg(version = "^5.1.0") {
  return { name: "app", scripts: { test: "vitest" }, dependencies: { nanoid: version } };
}

function lock(version = "5.1.0", extra: Record<string, LockEntry> = {}): LockFixture {
  return {
    name: "app",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "app", dependencies: { nanoid: `^${version}` } },
      "node_modules/nanoid": {
        version,
        resolved: `https://registry.npmjs.org/nanoid/-/nanoid-${version}.tgz`,
        integrity: `sha512-${version}`,
        dependencies: { child: "1.0.0" },
      },
      "node_modules/child": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/child/-/child-1.0.0.tgz",
        integrity: "sha512-child",
      },
      ...extra,
    },
  };
}

describe("Dependabot native auto-merge classification", () => {
  it("matches only explicit package names or scoped families", () => {
    expect(matchesAllowedPackage("nanoid", allowed)).toBe(true);
    expect(matchesAllowedPackage("@radix-ui/react-dialog", allowed)).toBe(true);
    expect(matchesAllowedPackage("next", allowed)).toBe(false);
    expect(parseDependencyNames("nanoid, swr, nanoid")).toEqual(["nanoid", "swr"]);
  });

  it("accepts one allowlisted patch and its transitive lock changes", () => {
    const baseLock = lock("5.1.0");
    const headLock = lock("5.1.1", {
      "node_modules/child": {
        version: "1.0.1",
        resolved: "https://registry.npmjs.org/child/-/child-1.0.1.tgz",
        integrity: "sha512-child-new",
      },
    });
    headLock.packages["node_modules/nanoid"].dependencies!.child = "1.0.1";
    expect(() =>
      validateSnapshot({
        config: {
          allowedFiles: ["package.json", "package-lock.json"],
          allowedPackages: allowed,
        },
        updateType: "version-update:semver-patch",
        dependencyNames: ["nanoid"],
        changedFiles: ["package.json", "package-lock.json"],
        basePackage: pkg("^5.1.0"),
        headPackage: pkg("^5.1.1"),
        baseLock,
        headLock,
      }),
    ).not.toThrow();
  });

  it("derives lock-only direct updates from versions and rejects hidden minor/core changes", () => {
    const base = lock("5.1.0");
    const patch = lock("5.1.1");
    patch.packages[""].dependencies!.nanoid = "^5.1.0";
    expect(changedDirectDependencies(pkg(), pkg(), base, patch)).toEqual(["nanoid"]);
    expect(() => validateLockChanges(base, patch, ["nanoid"], allowed)).not.toThrow();
    const minor = structuredClone(patch);
    minor.packages["node_modules/nanoid"].version = "5.2.0";
    expect(() => validateLockChanges(base, minor, ["nanoid"], allowed)).toThrow(/inte en patch/u);
    const core = structuredClone(patch);
    core.packages["node_modules/child"].version = "1.0.1";
    expect(() => validateLockChanges(base, core, ["nanoid"], ["nanoid"])).toThrow(/inte allowlistat/u);
  });

  it.each([
    ["minor", pkg("^5.1.0"), pkg("^5.2.0"), /inte en patch/u],
    ["script", pkg("^5.1.0"), { ...pkg("^5.1.1"), scripts: { test: "evil" } }, /andra ändringar/u],
    ["core", { dependencies: { next: "^16.3.0" } }, { dependencies: { next: "^16.3.1" } }, /allowlist/u],
  ])("rejects %s manifest changes", (_name, before, after, expected) => {
    expect(() => validateManifestChanges(before, after, [Object.keys(after.dependencies)[0]], allowed)).toThrow(
      expected,
    );
  });

  it("rejects mixed source changes and non-patch metadata", () => {
    const input = {
      config: { allowedFiles: ["package.json", "package-lock.json"], allowedPackages: allowed },
      dependencyNames: ["nanoid"],
      basePackage: pkg("^5.1.0"),
      headPackage: pkg("^5.1.1"),
      baseLock: lock("5.1.0"),
      headLock: lock("5.1.1"),
    };
    expect(() =>
      validateSnapshot({
        ...input,
        updateType: "version-update:semver-minor",
        changedFiles: ["package.json", "package-lock.json"],
      }),
    ).toThrow(/inte en patch/u);
    expect(() =>
      validateSnapshot({
        ...input,
        updateType: "version-update:semver-patch",
        changedFiles: ["package.json", "package-lock.json", "src/app.ts"],
      }),
    ).toThrow(/src\/app\.ts/u);
  });

  it("rejects unrelated lock entries, lifecycle scripts and non-registry tarballs", () => {
    const base = lock("5.1.0", {
      "node_modules/unrelated": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/unrelated/-/unrelated-1.0.0.tgz",
      },
    });
    const unrelated = structuredClone(base);
    unrelated.packages[""].dependencies!.nanoid = "^5.1.1";
    unrelated.packages["node_modules/nanoid"] = lock("5.1.1").packages["node_modules/nanoid"];
    unrelated.packages["node_modules/unrelated"].version = "2.0.0";
    expect(() => validateLockChanges(base, unrelated, ["nanoid"], allowed)).toThrow(/unrelated/u);

    const lifecycle = lock("5.1.1");
    lifecycle.packages["node_modules/nanoid"].hasInstallScript = true;
    expect(() => validateLockChanges(lock("5.1.0"), lifecycle, ["nanoid"], allowed)).toThrow(
      /install-script/u,
    );

    const foreign = lock("5.1.1");
    foreign.packages["node_modules/nanoid"].resolved = "https://example.test/nanoid.tgz";
    expect(() => validateLockChanges(lock("5.1.0"), foreign, ["nanoid"], allowed)).toThrow(
      /npm-registret/u,
    );
  });
});
