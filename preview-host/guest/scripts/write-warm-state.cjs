"use strict";

// Stamps `<warmDir>/.sajtmaskin-warm.json` with the dependency fingerprint of
// the warm baseline, computed EXACTLY like the host's
// `dependencyFingerprint()` in src/runtime/package-install.js (policy string +
// package.json + any lockfile). The host sends a project's fingerprint to the
// guest; equality means the warm node_modules can be copied instead of
// installed. The policy string is duplicated here on purpose (the guest image
// cannot import host code); `scripts/test-guest-agent.mjs` locks the two
// implementations together.

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const DEPENDENCY_INSTALL_POLICY = "2026-07-13-dev-deps-local-toolchain";
const FINGERPRINT_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
];

function dependencyFingerprintFromFiles(filesJson) {
  const hash = createHash("sha256");
  hash.update("policy:");
  hash.update(DEPENDENCY_INSTALL_POLICY);
  hash.update("\n");
  for (const key of FINGERPRINT_FILES) {
    if (typeof filesJson[key] === "string") {
      hash.update(key);
      hash.update("\n");
      hash.update(filesJson[key]);
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

function writeWarmState(warmDir) {
  const projectDir = path.join(warmDir, "project");
  const filesJson = {};
  for (const name of FINGERPRINT_FILES) {
    const filePath = path.join(projectDir, name);
    if (fs.existsSync(filePath)) filesJson[name] = fs.readFileSync(filePath, "utf8");
  }
  if (typeof filesJson["package.json"] !== "string") {
    throw new Error(`No package.json in ${projectDir}`);
  }
  const state = {
    fingerprint: dependencyFingerprintFromFiles(filesJson),
    policy: DEPENDENCY_INSTALL_POLICY,
    files: Object.keys(filesJson),
    writtenAt: new Date().toISOString(),
  };
  fs.mkdirSync(warmDir, { recursive: true });
  fs.writeFileSync(path.join(warmDir, ".sajtmaskin-warm.json"), JSON.stringify(state, null, 2), "utf8");
  return state;
}

if (require.main === module) {
  const warmDir = process.argv[2];
  if (!warmDir) {
    console.error("usage: write-warm-state.cjs <warmDir>");
    process.exit(2);
  }
  const state = writeWarmState(path.resolve(warmDir));
  console.log(`[preview-guest] warm fingerprint ${state.fingerprint.slice(0, 12)} written to ${warmDir}`);
}

module.exports = {
  DEPENDENCY_INSTALL_POLICY,
  dependencyFingerprintFromFiles,
  writeWarmState,
};
