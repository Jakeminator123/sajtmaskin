'use strict';

const http = require("node:http");
const { URL } = require("node:url");
const { proxyPreviewUpgrade } = require("../runtime.js");
const { json } = require("./http.js");
const { routeRequest } = require("./routes.js");

function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      await routeRequest(req, res);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected preview-host error.";
      json(res, 400, {
        error: "bad_request",
        message,
      });
    }
  });
  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const handled = await proxyPreviewUpgrade(req, socket, head, url.pathname, url.search);
      if (!handled) {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });
  return server;
}

module.exports = {
  createServer,
};
