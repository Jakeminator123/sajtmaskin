import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  collectTestCandidates,
  deriveDiscoveryCommands,
  evaluateTestDiscovery,
  splitCommandSegments,
  trackedAndUntrackedFiles,
} from "./test-discovery.mjs";

const packageJson = {
  scripts: {
    "test:ci": "vitest run",
    "test:stability": "vitest run -c vitest.stability.config.ts",
    "test:postgres": "vitest run -c vitest.postgres.config.ts",
    "test:e2e:contract": "playwright test -c playwright.deploy-smoke.config.ts --list",
    "backoffice:test": 'python -m unittest discover -s backoffice -p "test_*.py" -t .',
    "observability:test":
      'python -m unittest discover -s scripts/observability -p "test_*.py" -t scripts/observability',
    "db:blob-sync-unit": "python scripts/db/test_pydatabastest.py",
    "test:godnatt-bugg": "node --test .agents/skills/godnatt-bugg/scripts/run-state.test.mjs",
    "preview-host:verify":
      "npm --prefix preview-host run check && npm --prefix preview-host run test:guards",
  },
};

const previewPackageJson = {
  scripts: {
    check: "node --check server.mjs",
    "test:guards": "node scripts/test-preview-guard.mjs && npm run test:nested",
    "test:nested": "node scripts/test-preview-nested.mjs",
  },
};

describe("test discovery coverage", () => {
  it("covers the working tree through staged and unstaged deletes and renames", async () => {
    const root = mkdtempSync(join(tmpdir(), "sajtmaskin-discovery-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    try {
      git("init", "--quiet");
      for (const file of ["kept", "deleted", "staged-delete", "old", "staged-old"]) {
        writeFileSync(join(root, `${file}.test.ts`), "// test fixture\n");
      }
      git("add", ".");
      rmSync(join(root, "deleted.test.ts"));
      rmSync(join(root, "staged-delete.test.ts"));
      git("add", "--update", "--", "staged-delete.test.ts");
      renameSync(join(root, "old.test.ts"), join(root, "renamed.test.ts"));
      git("mv", "staged-old.test.ts", "staged-renamed.test.ts");
      writeFileSync(join(root, "untracked.test.ts"), "// new test fixture\n");

      const files = await trackedAndUntrackedFiles(root);
      expect(files.sort()).toEqual([
        "kept.test.ts",
        "renamed.test.ts",
        "staged-renamed.test.ts",
        "untracked.test.ts",
      ]);
      const result = evaluateTestDiscovery({
        files,
        discoveredFiles: ["kept.test.ts"],
        packageJson: { scripts: {} },
        previewPackageJson: { scripts: {} },
      });
      expect(result.unassigned).toEqual([
        "renamed.test.ts",
        "staged-renamed.test.ts",
        "untracked.test.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("derives distinct Vitest and Playwright configs from the existing package owner", () => {
    expect(deriveDiscoveryCommands(packageJson)).toEqual({
      vitestConfigs: ["", "vitest.postgres.config.ts", "vitest.stability.config.ts"],
      playwrightConfigs: ["playwright.deploy-smoke.config.ts"],
    });
  });

  it("assigns files through actual discovery and reachable package-script owners", () => {
    const files = [
      "src/feature.test.ts",
      "scripts/db/billing.postgres.test.ts",
      "e2e/deploy/current.smoke.spec.ts",
      "backoffice/test_routes.py",
      "scripts/observability/test_report.py",
      "scripts/db/test_pydatabastest.py",
      ".agents/skills/godnatt-bugg/scripts/run-state.test.mjs",
      "preview-host/scripts/test-preview-guard.mjs",
      "preview-host/scripts/test-preview-nested.mjs",
    ];
    const result = evaluateTestDiscovery({
      files,
      discoveredFiles: files.slice(0, 3),
      packageJson,
      previewPackageJson,
    });

    expect(result.unassigned).toEqual([]);
    expect(result.assigned).toEqual(collectTestCandidates(files));
  });

  it.each([
    "scripts/dev/orphan.test.mjs",
    "new-zone/test_orphan.py",
    "new-zone/orphan_test.py",
    "new-zone/testFoo.py",
    "e2e/deploy/orphan.spec.ts",
    "preview-host/scripts/test-orphan.mjs",
  ])("fails closed for an unassigned test file: %s", (orphan) => {
    const result = evaluateTestDiscovery({
      files: [orphan],
      discoveredFiles: [],
      packageJson,
      previewPackageJson,
    });

    expect(result.unassigned).toEqual([orphan]);
  });

  it("does not treat echoed test names as executed runners", () => {
    const misleadingPackage = {
      scripts: {
        fake: "echo new-zone/test_echo.py",
        node: "node --test scripts/real.test.mjs && echo scripts/orphan.test.mjs",
        vitest: "echo vitest run -c fake.config.ts",
        playwright: "echo playwright test -c fake.config.ts",
      },
    };
    const result = evaluateTestDiscovery({
      files: ["new-zone/test_echo.py", "scripts/real.test.mjs", "scripts/orphan.test.mjs"],
      discoveredFiles: [],
      packageJson: misleadingPackage,
      previewPackageJson,
    });

    expect(result.unassigned).toEqual(["new-zone/test_echo.py", "scripts/orphan.test.mjs"]);
    expect(deriveDiscoveryCommands(misleadingPackage)).toEqual({
      vitestConfigs: [],
      playwrightConfigs: [],
    });
  });

  it.each([
    ["single ampersand", "node --test scripts/real.test.mjs & echo scripts/orphan.test.mjs"],
    ["single pipe", "node --test scripts/real.test.mjs | echo scripts/orphan.test.mjs"],
    ["newline", "node --test scripts/real.test.mjs\necho scripts/orphan.test.mjs"],
    ["POSIX comment", "node --test scripts/real.test.mjs # echo scripts/orphan.test.mjs"],
  ])("does not leak Node test assignments across a %s boundary", (_label, command) => {
    const result = evaluateTestDiscovery({
      files: ["scripts/real.test.mjs", "scripts/orphan.test.mjs"],
      discoveredFiles: [],
      packageJson: { scripts: { test: command } },
      previewPackageJson,
    });

    expect(result.unassigned).toEqual(["scripts/orphan.test.mjs"]);
  });

  it.each([
    ["stdin operand", "node --test scripts/real.test.mjs < scripts/orphan.test.mjs"],
    ["stderr operand", "node --test scripts/real.test.mjs 2> scripts/orphan.test.mjs"],
    ["attached stdin operand", "node --test scripts/real.test.mjs <scripts/orphan.test.mjs"],
    ["attached stderr operand", "node --test scripts/real.test.mjs 2>scripts/orphan.test.mjs"],
    ["POSIX caret", "node --test scripts/real.test.mjs ^& echo scripts/orphan.test.mjs"],
  ])("does not treat a %s as a Node test argument", (_label, command) => {
    const result = evaluateTestDiscovery({
      files: ["scripts/real.test.mjs", "scripts/orphan.test.mjs"],
      discoveredFiles: [],
      packageJson: { scripts: { test: command } },
      previewPackageJson,
    });

    expect(result.unassigned).toEqual(["scripts/orphan.test.mjs"]);
  });

  it("preserves redirected descriptors and escaped separators inside one command", () => {
    expect(
      splitCommandSegments(
        "node --test scripts/real.test.mjs 2>&1 | tee output.log && echo \\& done",
      ),
    ).toEqual(["node --test scripts/real.test.mjs 2>&1", "tee output.log", "echo \\& done"]);
  });
});
