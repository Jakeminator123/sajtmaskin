import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PREVIEW_BACKDROP_POSTER_URL,
  PREVIEW_BACKDROP_VIDEO_SOURCES,
} = require("../src/runtime/preview-backdrop-media.js");
const {
  PREVIEW_BOOT_HEADINGS,
  PREVIEW_BOOT_MARKER_NAME,
  PREVIEW_BOOT_TITLES,
  renderPreviewPlaceholderPage,
} = require("../src/runtime/preview-placeholder-page.js");

function assertSharedContract(html, variant) {
  assert.match(html, new RegExp(`<title>${PREVIEW_BOOT_TITLES[variant]}</title>`));
  assert.match(
    html,
    new RegExp(`data-${PREVIEW_BOOT_MARKER_NAME}="${variant}"`),
  );
  assert.match(
    html,
    new RegExp(`<meta name="${PREVIEW_BOOT_MARKER_NAME}" content="${variant}"`),
  );
  assert.match(html, new RegExp(`<h1>${PREVIEW_BOOT_HEADINGS[variant]}</h1>`));
  assert.match(html, new RegExp(PREVIEW_BACKDROP_POSTER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /Chat:/);
  assert.doesNotMatch(html, /Status:\s*warm_project/);
  assert.doesNotMatch(html, /Status:\s*<code>/);
}

const starting = renderPreviewPlaceholderPage("starting");
assertSharedContract(starting, "starting");
assert.match(starting, /http-equiv="refresh" content="4"/);
assert.match(starting, /prefers-reduced-motion:\s*reduce/);
assert.match(starting, /navigator\.connection && navigator\.connection\.saveData/);
assert.match(starting, /sajtmaskin-preview-boot-t/);
assert.match(starting, /loadedmetadata/);
assert.match(starting, /<template id="sm-boot-video-tpl"/);
assert.match(starting, /<video id="sm-boot-video"/);
assert.match(starting, /preload="none"/);
assert.match(starting, /sm-boot-still/);
assert.match(starting, /tpl\.parentNode\.removeChild\(tpl\)/);
assert.match(starting, /muted playsinline loop/);
assert.doesNotMatch(starting.replace(/<template[\s\S]*?<\/template>/, ""), /<video\b/);
for (const source of PREVIEW_BACKDROP_VIDEO_SOURCES) {
  assert.match(starting, new RegExp(source.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(starting, new RegExp(`type="${source.type}"`));
}

const recovering = renderPreviewPlaceholderPage("recovering");
assertSharedContract(recovering, "recovering");
assert.match(recovering, /http-equiv="refresh" content="4"/);
assert.match(recovering, /<template id="sm-boot-video-tpl"/);
assert.match(recovering, /<video id="sm-boot-video"/);
assert.doesNotMatch(recovering.replace(/<template[\s\S]*?<\/template>/, ""), /<video\b/);

const errorPage = renderPreviewPlaceholderPage("error");
assertSharedContract(errorPage, "error");
assert.doesNotMatch(errorPage, /http-equiv="refresh"/i);
assert.doesNotMatch(errorPage, /<video\b/);
assert.match(errorPage, /Uppstarten misslyckades/);

assert.throws(() => renderPreviewPlaceholderPage("live"), /unknown preview placeholder variant/);

console.log("preview-placeholder-page: ok");
