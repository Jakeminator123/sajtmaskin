// Inspector parent-allowlist: första SAJTMASKIN_APP_ORIGINS-posten är
// canonical scriptkälla; hela den validerade listan skickas som parent=.
// Ogiltiga poster fail-closar. Körs med: `npm run test:inspect-parent-allowlist`.

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  configuredAppOrigins,
  inspectInjectionScriptSrc,
} = require("../src/runtime/inspect-bridge-src.js");

const raw =
  "https://sajtmaskin.vercel.app,https://sajtmaskin.se,https://www.sajtmaskin.se,https://sajtmaskin.com,https://www.sajtmaskin.com,https://sajtmaskin-git-preview-jakeminator123s-projects.vercel.app,https://preview.sajtmaskin.se,https://rejected.example/path,https://ignored.example?wide=1,*";

const trustedParents = [
  "https://sajtmaskin.vercel.app",
  "https://sajtmaskin.se",
  "https://www.sajtmaskin.se",
  "https://sajtmaskin.com",
  "https://www.sajtmaskin.com",
  "https://sajtmaskin-git-preview-jakeminator123s-projects.vercel.app",
  "https://preview.sajtmaskin.se",
];

assert.deepEqual(configuredAppOrigins(raw), trustedParents);
assert.deepEqual(configuredAppOrigins(""), []);

assert.equal(inspectInjectionScriptSrc("?inspect=1", { versionId: "ver_1" }, []), null);
assert.equal(inspectInjectionScriptSrc("", { versionId: "ver_1" }, trustedParents), null);
assert.equal(inspectInjectionScriptSrc("?inspect=0", { versionId: "ver_1" }, trustedParents), null);

const src = inspectInjectionScriptSrc("?inspect=1&foo=from-user", {
  versionId: "ver_1",
  previewSessionId: "ps_1",
  lifecycleToken: "life_1",
}, trustedParents);
assert.ok(src, "inspect=1 injects a bridge URL");
const url = new URL(src);
assert.equal(url.origin, "https://sajtmaskin.vercel.app");
assert.equal(url.pathname, "/api/inspect-bridge");
assert.deepEqual(url.searchParams.getAll("parent"), trustedParents);
assert.equal(url.searchParams.get("versionId"), "ver_1");
assert.equal(url.searchParams.get("previewSessionId"), "ps_1");
assert.equal(url.searchParams.get("lifecycleToken"), "life_1");
assert.equal(url.searchParams.has("foo"), false);
assert.ok(!src.includes("*"), "injection never uses a wildcard origin");
assert.ok(
  !url.searchParams.getAll("parent").some((origin) => origin.includes("rejected.example")),
  "invalid allowlist entries stay out of the parent list",
);

const seFirst = inspectInjectionScriptSrc("inspect=1", {
  versionId: "ver_1",
  previewSessionId: "ps_1",
}, ["https://sajtmaskin.se", "https://sajtmaskin.vercel.app"]);
const seFirstUrl = new URL(seFirst);
assert.equal(seFirstUrl.origin, "https://sajtmaskin.se");
assert.deepEqual(seFirstUrl.searchParams.getAll("parent"), [
  "https://sajtmaskin.se",
  "https://sajtmaskin.vercel.app",
]);
assert.equal(seFirstUrl.searchParams.get("lifecycleToken"), "");

console.log("  OK    inspect parent allowlist (script source vs parents)");
