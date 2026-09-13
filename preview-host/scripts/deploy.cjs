'use strict';

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { isSourceSha } = require("../src/release.js");

// Only files consumed by Docker/Fly. Ignored caches, secrets and unrelated local
// docs/test edits never enter the upload or affect its source identity.
const BUILD_INPUTS = [
  "Dockerfile", ".dockerignore", "fly.toml", "package.json", "package-lock.json",
  "src", "scripts/write-release.cjs",
];

function prepareDeployment(hostDir) {
  const git = (args, encoding = "utf8") => execFileSync("git", args, {
    cwd: hostDir, encoding, stdio: ["ignore", "pipe", "pipe"],
  });
  const sourceSha = git(["rev-parse", "--verify", "HEAD"]).trim();
  if (!isSourceSha(sourceSha)) throw new Error("Cannot identify the preview-host source commit.");
  const dirty = git(["status", "--porcelain", "--untracked-files=all", "--", ...BUILD_INPUTS]);
  if (dirty.trim()) {
    throw new Error("Preview-host build inputs have uncommitted changes. Commit them before deploying.");
  }
  const prefix = git(["rev-parse", "--show-prefix"]).trim();
  const tree = prefix ? `${sourceSha}:${prefix.replace(/\/$/, "")}` : sourceSha;
  const entries = git(["ls-tree", "-rz", "--full-tree", tree]).split("\0").filter(Boolean);
  const contextDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-host-release-"));
  try {
    for (const entry of entries) {
      const [, mode, type, hash, name] = entry.match(/^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/) || [];
      if (!name || !BUILD_INPUTS.some((input) => name === input || name.startsWith(`${input}/`))) continue;
      if (type !== "blob" || !["100644", "100755"].includes(mode)) {
        throw new Error(`Unsupported build input type: ${name}`);
      }
      const destination = path.join(contextDir, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, git(["cat-file", "blob", hash], null));
      fs.chmodSync(destination, mode === "100755" ? 0o755 : 0o644);
    }
    return { sourceSha, contextDir };
  } catch (error) {
    fs.rmSync(contextDir, { recursive: true, force: true });
    throw error;
  }
}

function deployArgs(sourceSha) {
  return ["deploy", "--remote-only", "--config", "fly.toml", "--build-arg", `PREVIEW_HOST_BUILD_SHA=${sourceSha}`];
}

function findFly() {
  for (const executable of ["fly", "flyctl"]) {
    const result = spawnSync(executable, ["version"], { stdio: "ignore" });
    if (!result.error && result.status === 0) return executable;
  }
  throw new Error("Fly CLI not found on PATH (fly or flyctl). Install it before deploying.");
}

function main(args, {
  hostDir = path.join(__dirname, ".."),
  findExecutable = findFly,
  runFly = spawnSync,
} = {}) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--dry-run")) {
    throw new Error("Usage: npm run deploy [-- --dry-run]. Build context and identity cannot be overridden.");
  }
  const release = prepareDeployment(hostDir);
  try {
    console.log(`Preview-host source SHA: ${release.sourceSha}`);
    if (args[0] === "--dry-run") return;
    const result = runFly(findExecutable(), deployArgs(release.sourceSha), {
      cwd: release.contextDir, stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Fly deploy failed (${result.signal || result.status}).`);
  } finally {
    fs.rmSync(release.contextDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    // Never print child-process objects: they may contain environment or output.
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { prepareDeployment, deployArgs, main };
