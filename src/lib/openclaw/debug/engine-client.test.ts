import { describe, it, expect, vi } from "vitest";
import { createHttpEngineClient } from "./engine-client";

function sse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("createHttpEngineClient.createChat (Codex P1: project id)", () => {
  it("sends meta.appProjectId so the create-chat route can resolve the project", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (url: unknown, init: unknown) => {
      const u = String(url);
      const body = JSON.parse((init as { body: string }).body);
      if (u.endsWith("/api/engine/chats/stream")) {
        bodies.push(body);
        return sse('data: {"chatId":"c1","versionId":"v1"}\n\ndata: [DONE]\n\n');
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const client = createHttpEngineClient({
      baseUrl: "http://x",
      appProjectId: "app-123",
      fetchImpl,
    });
    const ref = await client.createChat({ prompt: "build a thing" });

    expect(ref).toEqual({ chatId: "c1", versionId: "v1" });
    const createBody = bodies[0] as { meta?: { appProjectId?: string } };
    expect(createBody.meta?.appProjectId).toBe("app-123");
  });

  it("forwards baseVersionId as meta.engineBaseVersionId on follow-ups (Bugbot HIGH)", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (url: unknown, init: unknown) => {
      const u = String(url);
      if (u.includes("/api/engine/chats/c1/stream")) {
        bodies.push(JSON.parse((init as { body: string }).body));
        return sse('data: {"chatId":"c1","versionId":"v2"}\n\ndata: [DONE]\n\n');
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const client = createHttpEngineClient({ baseUrl: "http://x", fetchImpl });
    const ref = await client.sendFollowUp({ chatId: "c1", prompt: "tweak", baseVersionId: "v1" });
    expect(ref).toEqual({ chatId: "c1", versionId: "v2" });
    const meta = (bodies[0] as { meta?: { engineBaseVersionId?: string; engineLatestKnownVersionId?: string } }).meta;
    expect(meta?.engineBaseVersionId).toBe("v1");
    // Must NOT send engineLatestKnownVersionId — that would re-arm the stale-base 409 gate.
    expect(meta?.engineLatestKnownVersionId).toBeUndefined();
  });

  it("sends top-level projectId when only the legacy id is provided", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (url: unknown, init: unknown) => {
      const u = String(url);
      if (u.endsWith("/api/engine/chats/stream")) {
        bodies.push(JSON.parse((init as { body: string }).body));
        return sse('data: {"chatId":"c1","versionId":"v1"}\n\ndata: [DONE]\n\n');
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const client = createHttpEngineClient({
      baseUrl: "http://x",
      projectId: "proj-legacy",
      fetchImpl,
    });
    await client.createChat({ prompt: "build" });
    expect((bodies[0] as { projectId?: string }).projectId).toBe("proj-legacy");
  });
});

describe("createHttpEngineClient.waitForVersionSettled (Codex P1: read phase)", () => {
  it("reads status.phase and keeps polling until a terminal phase", async () => {
    const phases = ["streaming", "verifying", "done"];
    let i = 0;
    const fetchImpl = vi.fn(async () => {
      const phase = phases[Math.min(i, phases.length - 1)];
      i += 1;
      return new Response(
        JSON.stringify({ ok: true, versionId: "v1", status: { phase, done: phase === "done" } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createHttpEngineClient({
      baseUrl: "http://x",
      fetchImpl,
      settlePollIntervalMs: 0,
      settleMaxPolls: 10,
    });
    const result = await client.waitForVersionSettled({ chatId: "c1", versionId: "v1" });
    expect(result.state).toBe("done");
    expect(result.settled).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does NOT early-exit on a streaming version (regression for the status.kind bug)", async () => {
    // Old code read `status.kind`, always got "unknown" (non-transient) and
    // returned on the first poll — forcing gates against a streaming version.
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ status: { phase: "streaming" } }), { status: 200 }),
    ) as unknown as typeof fetch;

    const client = createHttpEngineClient({
      baseUrl: "http://x",
      fetchImpl,
      settlePollIntervalMs: 0,
      settleMaxPolls: 3,
    });
    const result = await client.waitForVersionSettled({ chatId: "c1", versionId: "v1" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.state).toBe("streaming");
    expect(result.settled).toBe(false);
  });

  it("treats a blocked phase as settled (terminal-with-blockers)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ status: { phase: "blocked" } }), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createHttpEngineClient({
      baseUrl: "http://x",
      fetchImpl,
      settlePollIntervalMs: 0,
      settleMaxPolls: 5,
    });
    const result = await client.waitForVersionSettled({ chatId: "c1", versionId: "v1" });
    expect(result.state).toBe("blocked");
    expect(result.settled).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
