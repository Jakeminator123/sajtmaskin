const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createServer } = require("../src/server.js");

async function main() {
  if (!process.env.PREVIEW_HOST_DATA_DIR) {
    process.env.PREVIEW_HOST_DATA_DIR = path.join(
      os.tmpdir(),
      `preview-host-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
  }

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

    const started = await postJson(`${baseUrl}/preview/session/start`, {
      projectId: "demo-project",
      versionId: "ver_1",
      changeClass: "fresh",
      preferredBaseImage: "nextjs-basic",
    });
    assert.equal(started.status, 201);
    assert.equal(started.body.projectId, "demo-project");
    assert.equal(started.body.lastAction, "start");

    const sessionId = started.body.sessionId;
    const sandboxId = started.body.sandboxId;

    const st = await getJson(`${baseUrl}/preview/sandbox/${encodeURIComponent(sandboxId)}/status`);
    assert.equal(st.status, 200);
    assert.equal(st.body.ok, true);
    assert.equal(st.body.running, true);
    assert.equal(st.body.sandboxId, sandboxId);

    const fetched = await getJson(`${baseUrl}/preview/session/${sessionId}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.sessionId, sessionId);

    const updated = await postJson(`${baseUrl}/preview/session/update`, {
      sessionId,
      versionId: "ver_2",
      changeClass: "light",
      filesJson: {
        "app/page.tsx": "export default function Page() { return <div>Hello</div>; }",
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.versionId, "ver_2");
    assert.equal(updated.body.lastAction, "update");

    const hibernated = await postJson(`${baseUrl}/preview/session/hibernate`, {
      sessionId,
    });
    assert.equal(hibernated.status, 200);
    assert.equal(hibernated.body.status, "hibernated");
    assert.equal(hibernated.body.lastAction, "hibernate");

    const logs = await getJson(`${baseUrl}/preview/logs/${sandboxId}`);
    assert.equal(logs.status, 200);
    assert.ok(Array.isArray(logs.body.lines));
    assert.ok(logs.body.lines.length >= 3);

    const destroyed = await postJson(`${baseUrl}/preview/session/destroy`, {
      sessionId,
    });
    assert.equal(destroyed.status, 200);
    assert.equal(destroyed.body.destroyed, true);

    console.log("Smoke test passed.");
  } finally {
    server.close();
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
