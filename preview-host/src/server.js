"use strict";

// Entrypoint for preview-host (`npm start` = `node src/server.js`).
// Implementation lives in ./server/* by responsibility; this file boots the
// HTTP server and keeps the same public exports (`createServer`,
// `applyPublicPreviewHeaders`) that guard/smoke scripts require.

const {
  PORT,
  HOST,
  BACKGROUND_CLEANUP_INTERVAL_MS,
  RUNTIME_IDLE_SWEEP_INTERVAL_MS,
} = require("./server/config.js");
const { applyPublicPreviewHeaders } = require("./server/http.js");
const { createServer } = require("./server/create-server.js");
const {
  cleanupPreviewHostStorage,
  sweepIdleRuntimes,
} = require("./runtime.js");

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`preview-host listening on http://${HOST}:${PORT}`);
  });
  void cleanupPreviewHostStorage().catch(() => null);
  const cleanupTimer = setInterval(() => {
    void cleanupPreviewHostStorage().catch(() => null);
  }, BACKGROUND_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
  const idleSweepTimer = setInterval(() => {
    void sweepIdleRuntimes().catch(() => null);
  }, RUNTIME_IDLE_SWEEP_INTERVAL_MS);
  idleSweepTimer.unref?.();
}

module.exports = {
  applyPublicPreviewHeaders,
  createServer,
};
