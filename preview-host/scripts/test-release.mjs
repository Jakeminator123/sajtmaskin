import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { readReleaseIdentity } = require("../src/release.js");
const { writeRelease } = require("./write-release.cjs");
const { prepareDeployment, main } = require("./deploy.cjs");
const hostDir = fileURLToPath(new URL("..", import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-host-release-test-"));
const sourceSha = "a".repeat(40);
const expected = { sourceSha, status: "identified" };
const unknown = { sourceSha: null, status: "unknown" };

function healthFromFixture(fixtureDir) {
  // Exercise the real HTTP route in a fresh process, with a synthetic app SHA
  // and secret to prove neither is used as public build metadata.
  const result = execFileSync(process.execPath, ["-e", `
    const { createServer } = require('./src/server/create-server.js');
    const server = createServer();
    server.listen(0, '127.0.0.1', async () => {
      try {
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/health');
        console.log(JSON.stringify({ status: response.status, body: await response.json() }));
      } catch (error) { console.error(error); process.exitCode = 1; }
      finally { server.close(); }
    });
  `], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      NODE_PATH: path.join(hostDir, "node_modules"),
      PREVIEW_HOST_DATA_DIR: path.join(fixtureDir, "data"),
      VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
      PREVIEW_HOST_BUILD_SHA: "c".repeat(40),
      PREVIEW_HOST_API_KEY: "synthetic-health-test-secret",
    },
    encoding: "utf8", timeout: 15_000,
  });
  assert.ok(!result.includes("synthetic-health-test-secret"));
  const response = JSON.parse(result.trim());
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.service, "preview-host");
  assert.equal(response.body.sessions, 0);
  assert.ok(Number.isFinite(Date.parse(response.body.ts)));
  return response.body.release;
}

try {
  const metadata = path.join(tempDir, "build-release.json");
  assert.deepEqual(readReleaseIdentity(metadata), unknown);
  for (const invalid of [undefined, "", "abc1234", "A".repeat(40), `${sourceSha}\n`, "secret-value"]) {
    assert.throws(() => writeRelease(invalid, metadata), /full lowercase Git commit SHA/);
    assert.ok(!fs.existsSync(metadata));
  }
  writeRelease(sourceSha, metadata);
  assert.deepEqual(readReleaseIdentity(metadata), expected);
  for (const invalid of ["{broken", "null", JSON.stringify({ sourceSha }), JSON.stringify({ schemaVersion: 1, sourceSha: "secret-value" })]) {
    fs.writeFileSync(metadata, invalid);
    assert.deepEqual(readReleaseIdentity(metadata), unknown);
  }
  const missingArg = spawnSync(process.execPath, [path.join(hostDir, "scripts/write-release.cjs")], {
    cwd: tempDir, encoding: "utf8",
  });
  assert.equal(missingArg.status, 1, "direct image build fails without its required SHA");

  const httpFixture = path.join(tempDir, "http");
  fs.cpSync(path.join(hostDir, "src"), path.join(httpFixture, "src"), { recursive: true });
  assert.deepEqual(healthFromFixture(httpFixture), unknown, "runtime env cannot invent an image identity");
  writeRelease(sourceSha, path.join(httpFixture, "build-release.json"));
  assert.deepEqual(healthFromFixture(httpFixture), expected, "health reports the baked host commit");
  fs.writeFileSync(path.join(httpFixture, "build-release.json"), "{bad");
  assert.deepEqual(healthFromFixture(httpFixture), unknown);

  const repoDir = path.join(tempDir, "repo");
  const fixtureHost = path.join(repoDir, "preview-host");
  fs.mkdirSync(path.join(fixtureHost, "src"), { recursive: true });
  fs.writeFileSync(path.join(fixtureHost, "src/server.js"), "committed source\n");
  fs.writeFileSync(path.join(fixtureHost, "Dockerfile"), "FROM node:22-alpine\n");
  fs.writeFileSync(path.join(fixtureHost, ".dockerignore"), "README.md\nnode_modules\n");
  const git = (...args) => execFileSync("git", args, { cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init");
  git("add", "preview-host");
  git("-c", "user.name=Release Test", "-c", "user.email=release-test@example.invalid", "-c", `core.hooksPath=${path.join(tempDir, "no-hooks")}`, "commit", "-m", "fixture");
  const committedSha = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(fixtureHost, "README.md"), "unrelated local note");
  fs.writeFileSync(path.join(repoDir, "unrelated.txt"), "unrelated local change");
  fs.mkdirSync(path.join(fixtureHost, "node_modules"));
  fs.writeFileSync(path.join(fixtureHost, "node_modules/local.txt"), "must not upload");
  const deployment = prepareDeployment(fixtureHost);
  try {
    assert.equal(deployment.sourceSha, committedSha);
    assert.equal(fs.readFileSync(path.join(deployment.contextDir, "src/server.js"), "utf8"), "committed source\n");
    assert.ok(!fs.existsSync(path.join(deployment.contextDir, "node_modules")));
    assert.ok(!fs.existsSync(path.join(deployment.contextDir, "README.md")));
    fs.writeFileSync(path.join(fixtureHost, "src/server.js"), "changed after snapshot\n");
    assert.equal(fs.readFileSync(path.join(deployment.contextDir, "src/server.js"), "utf8"), "committed source\n", "upload is an immutable snapshot of the identified commit");
    assert.throws(() => prepareDeployment(fixtureHost), /uncommitted changes/);
    fs.writeFileSync(path.join(fixtureHost, "src/server.js"), "committed source\n");
    fs.writeFileSync(path.join(fixtureHost, "src/untracked.js"), "uncommitted build input");
    assert.throws(() => prepareDeployment(fixtureHost), /uncommitted changes/);
  } finally {
    fs.rmSync(deployment.contextDir, { recursive: true, force: true });
  }
  fs.rmSync(path.join(fixtureHost, "src/untracked.js"));
  let uploadedContext;
  const fakeFly = {
    hostDir: fixtureHost,
    findExecutable: () => "local-test-fly",
    runFly: (executable, args, options) => {
      assert.equal(executable, "local-test-fly");
      assert.deepEqual(args, ["deploy", "--remote-only", "--config", "fly.toml", "--build-arg", `PREVIEW_HOST_BUILD_SHA=${committedSha}`]);
      uploadedContext = options.cwd;
      assert.equal(fs.readFileSync(path.join(uploadedContext, "src/server.js"), "utf8"), "committed source\n");
      return { status: 0 };
    },
  };
  main([], fakeFly);
  assert.ok(!fs.existsSync(uploadedContext), "successful deploy cleans temporary upload context");
  assert.throws(() => main([], {
    ...fakeFly,
    runFly: (...args) => { fakeFly.runFly(...args); return { status: 1 }; },
  }), /Fly deploy failed/);
  assert.ok(!fs.existsSync(uploadedContext), "failed deploy cleans temporary upload context");
  main(["--dry-run"], { ...fakeFly, findExecutable: () => { throw new Error("dry-run must not call Fly"); } });
  assert.throws(() => main(["--image", "unrelated-image"]), /cannot be overridden/);
  console.log("OK release identity: build validation, real health route, immutable Git deployment context, dirty-input rejection");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
