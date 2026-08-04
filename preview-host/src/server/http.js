"use strict";

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function notFound(res) {
  json(res, 404, {
    error: "not_found",
    message: "Route not found.",
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Body must be valid JSON.");
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isLocalEnvironment() {
  const host = process.env.HOST ?? "0.0.0.0";
  const flyApp = process.env.FLY_APP_NAME;
  return !flyApp && (host === "127.0.0.1" || host === "localhost");
}

function checkApiKey(req, res) {
  const expected = process.env.PREVIEW_HOST_API_KEY?.trim();
  if (!expected) {
    if (isLocalEnvironment()) return true;
    json(res, 503, {
      error: "configuration_error",
      message: "PREVIEW_HOST_API_KEY is required in non-local environments.",
    });
    return false;
  }
  const auth = req.headers.authorization ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerKey = req.headers["x-preview-host-key"];
  const alt =
    typeof headerKey === "string" ? headerKey.trim() : Array.isArray(headerKey) ? headerKey[0]?.trim() : "";
  const token = bearer || alt;
  if (token === expected) {
    return true;
  }
  json(res, 401, {
    error: "unauthorized",
    message: "Invalid or missing API key.",
  });
  return false;
}

function applyPublicPreviewHeaders(res) {
  // Preview URLs are intentionally shareable for builder iteration, but never
  // a published site. Keep crawlers from indexing generated drafts.
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Cache-Control", "private, no-store");
}

module.exports = {
  json,
  notFound,
  readJsonBody,
  nowIso,
  isLocalEnvironment,
  checkApiKey,
  applyPublicPreviewHeaders,
};
