'use strict';

const fs = require("node:fs");
const { isSourceSha } = require("../src/release.js");

function writeRelease(sourceSha, outputPath) {
  if (!isSourceSha(sourceSha)) {
    throw new Error("PREVIEW_HOST_BUILD_SHA must be a full lowercase Git commit SHA. Use npm run deploy.");
  }
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, sourceSha })}\n`);
}

if (require.main === module) {
  try {
    writeRelease(process.argv[2], process.argv[3] || "build-release.json");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { writeRelease };
