'use strict';

const fs = require("node:fs");
const path = require("node:path");

function isSourceSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

// Build metadata belongs to this image, never to the main app's environment.
// Missing/invalid metadata keeps health useful without claiming a release match.
function readReleaseIdentity(filePath = path.join(__dirname, "../build-release.json")) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (data?.schemaVersion === 1 && isSourceSha(data.sourceSha)) {
      return Object.freeze({ sourceSha: data.sourceSha, status: "identified" });
    }
  } catch {
    // Local starts and older/manual images may have no build metadata.
  }
  return Object.freeze({ sourceSha: null, status: "unknown" });
}

module.exports = { isSourceSha, readReleaseIdentity };
