const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  if (!process.env.PREVIEW_HOST_DATA_DIR) {
    process.env.PREVIEW_HOST_DATA_DIR = path.join(
      os.tmpdir(),
      `preview-host-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
  }

  process.env.HOST = "127.0.0.1";
  process.env.PREVIEW_BASE_URL = "http://127.0.0.1:0000";
  const { createServer } = require("../src/server.js");
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve local smoke-test port.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    console.log(`Smoke test running against ${baseUrl}`);

    const health = await getJson(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);

    const phRes = await fetch(
      `${baseUrl}/placeholder.svg?width=40&height=30&text=${encodeURIComponent("smoke")}`,
    );
    assert.equal(phRes.status, 200);
    assert.match(phRes.headers.get("content-type") || "", /image\/svg\+xml/i);
    const phBody = await phRes.text();
    assert.match(phBody, /<svg[\s\S]*smoke[\s\S]*<\/svg>/i);

    const started = await postJson(`${baseUrl}/preview/session/start`, {
      chatId: "chat_demo_1",
      versionId: "ver_1",
      changeClass: "fresh",
      preferredBaseImage: "nextjs-basic",
      filesJson: {
        "package.json": JSON.stringify(
          {
            name: "demo-project",
            private: true,
            scripts: {
              dev: "node server.js",
            },
          },
          null,
          2,
        ),
        "server.js": [
          "const http = require('node:http');",
          "const port = Number(process.env.PORT || 3000);",
          "const host = process.env.HOSTNAME || '127.0.0.1';",
          "http.createServer((req, res) => {",
          "  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });",
          "  res.end(`<html><body><h1>demo-project</h1><p>${req.url}</p><p>Smoke readiness filler so HTML body exceeds the preview-host visible-text threshold.</p></body></html>`);",
          "}).listen(port, host);",
        ].join("\n"),
      },
    });
    if (started.status !== 201) {
      console.error("start failed", started.body);
    }
    assert.equal(started.status, 201);
    assert.equal(started.body.chatId, "chat_demo_1");
    assert.equal(started.body.lastAction, "start");

    const sessionId = started.body.sessionId;
    const previewSessionId = started.body.previewSessionId;

    const st = await getJson(`${baseUrl}/preview/session/${encodeURIComponent(previewSessionId)}/status`);
    assert.equal(st.status, 200);
    assert.equal(st.body.ok, true);
    assert.equal(st.body.previewSessionId, previewSessionId);

    const verified = await postJson(`${baseUrl}/preview/verify`, {
      chatId: "chat_demo_1",
      versionId: "ver_verify_1",
      checks: ["lint"],
      filesJson: {
        "package.json": JSON.stringify(
          {
            name: "verify-project",
            private: true,
          },
          null,
          2,
        ),
        "README.md": "verify lane smoke",
      },
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.ok, true);
    assert.ok(Array.isArray(verified.body.results));
    const installResult = verified.body.results.find((entry) => entry.check === "install");
    const lintResult = verified.body.results.find((entry) => entry.check === "lint");
    assert.ok(installResult, "verify result should contain install check");
    assert.ok(lintResult, "verify result should contain lint check");
    assert.equal(installResult?.passed, true);
    assert.equal(lintResult?.passed, true);
    assert.match(String(lintResult?.output || ""), /Skipped lint/i);

    const previewHtml = await waitForPreviewHtml(`${baseUrl}/chat_demo_1`, /demo-project/);
    assert.match(previewHtml, /demo-project/);

    const fetched = await getJson(`${baseUrl}/preview/session/${sessionId}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.sessionId, sessionId);

    const updated = await postJson(`${baseUrl}/preview/session/update`, {
      previewSessionId,
      versionId: "ver_2",
      changeClass: "light",
      filesJson: {
        "app/page.tsx": "export default function Page() { return <div>Hello</div>; }",
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.versionId, "ver_2");
    assert.equal(updated.body.lastAction, "update");

    const replaced = await postJson(`${baseUrl}/preview/session/update`, {
      previewSessionId,
      versionId: "ver_replace",
      changeClass: "light",
      replaceFiles: true,
      filesJson: {
        "app/page.tsx": "export default function Page() { return <div>Replaced</div>; }",
      },
    });
    assert.equal(replaced.status, 200);
    assert.equal(replaced.body.versionId, "ver_replace");
    const filesAfterReplace = readSessionFilesJsonFromStore(sessionId);
    assert.deepEqual(Object.keys(filesAfterReplace).sort(), ["app/page.tsx"]);
    assert.equal(typeof filesAfterReplace["package.json"], "undefined");
    assert.equal(typeof filesAfterReplace["server.js"], "undefined");

    const invalidReplace = await postJson(`${baseUrl}/preview/session/update`, {
      previewSessionId,
      versionId: "ver_bad_replace",
      changeClass: "light",
      replaceFiles: true,
      filesJson: null,
    });
    assert.equal(invalidReplace.status, 400);
    assert.match(String(invalidReplace.body.message || ""), /replaceFiles update requires/);

    const afterInvalidReplace = await getJson(`${baseUrl}/preview/session/${sessionId}`);
    assert.equal(afterInvalidReplace.status, 200);
    assert.equal(afterInvalidReplace.body.versionId, "ver_replace");

    const hibernated = await postJson(`${baseUrl}/preview/session/hibernate`, {
      previewSessionId,
    });
    assert.equal(hibernated.status, 200);
    assert.equal(hibernated.body.status, "hibernated");
    assert.equal(hibernated.body.lastAction, "hibernate");

    const logs = await getJson(`${baseUrl}/preview/logs/${previewSessionId}`);
    assert.equal(logs.status, 200);
    assert.ok(Array.isArray(logs.body.lines));
    assert.ok(logs.body.lines.length >= 3);

    const destroyed = await postJson(`${baseUrl}/preview/session/destroy`, {
      previewSessionId,
    });
    assert.equal(destroyed.status, 200);
    assert.equal(destroyed.body.destroyed, true);

    console.log("Smoke test passed.");
  } finally {
    await new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
      server.closeIdleConnections?.();
    });
    try {
      fs.rmSync(process.env.PREVIEW_HOST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function getJson(url) {
  const response = await fetch(url);
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function waitForPreviewHtml(url, readyPattern) {
  const deadline = Date.now() + 30_000;
  let lastHtml = "";
  while (Date.now() < deadline) {
    const response = await fetch(url);
    const html = await response.text();
    lastHtml = html;
    if (response.status === 200 && readyPattern.test(html)) {
      return html;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Preview did not become ready in time. Last HTML: ${lastHtml.slice(0, 400)}`);
}

function readSessionFilesJsonFromStore(sessionId) {
  const fp = path.join(process.env.PREVIEW_HOST_DATA_DIR, "preview-host-store.json");
  const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
  const session = parsed?.sessions?.[sessionId];
  assert.ok(session && typeof session === "object", "session should exist in store");
  assert.equal(typeof session.previewSessionId, "string");
  assert.equal(typeof session.sandboxId, "undefined");
  assert.equal(typeof parsed.sandboxToSession, "undefined");
  assert.ok(parsed.previewSessionToSession && typeof parsed.previewSessionToSession === "object");
  const filesJson = session.filesJson;
  assert.ok(filesJson && typeof filesJson === "object" && !Array.isArray(filesJson), "filesJson should be object");
  return filesJson;
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
