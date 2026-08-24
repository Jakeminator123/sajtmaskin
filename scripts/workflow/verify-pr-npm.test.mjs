import assert from "node:assert/strict";
import test from "node:test";

import { resolveNpmInvocation } from "./verify-pr.mjs";

test("uses node + npm-cli.js when npm_execpath is set", () => {
  const npm = resolveNpmInvocation({
    platform: "win32",
    npmExecPath: "C:/npm/npm-cli.js",
    nodeExecutable: "C:/node/node.exe",
  });
  assert.deepEqual(npm, {
    command: "C:/node/node.exe",
    args: ["C:/npm/npm-cli.js"],
    shell: false,
  });
});

test("falls back to npm.cmd + shell on Windows without npm_execpath", () => {
  const npm = resolveNpmInvocation({
    platform: "win32",
    npmExecPath: "",
    nodeExecutable: "C:/node/node.exe",
  });
  assert.deepEqual(npm, { command: "npm.cmd", args: [], shell: true });
});

test("uses npm without shell on non-Windows without npm_execpath", () => {
  const npm = resolveNpmInvocation({
    platform: "linux",
    npmExecPath: "",
    nodeExecutable: "/usr/bin/node",
  });
  assert.deepEqual(npm, { command: "npm", args: [], shell: false });
});
