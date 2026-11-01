import { describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _key: string, handler: () => unknown) => handler(),
}));
vi.mock("@/lib/db/services/projects", () => ({ getProjectByIdForOwner: vi.fn() }));
vi.mock("@/lib/projects/project-env-vars", () => ({
  deleteStoredProjectEnvVars: vi.fn(),
  getStoredProjectEnvVars: vi.fn(),
  upsertStoredProjectEnvVars: vi.fn(),
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({ getSessionIdFromRequest: vi.fn() }));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));

import { DELETE, GET, POST } from "./route";

describe("project env vars API", () => {
  it.each([
    ["GET", GET, undefined],
    [
      "POST",
      POST,
      { method: "POST", body: JSON.stringify({ vars: [{ key: "API_KEY", value: "x" }] }) },
    ],
    ["DELETE", DELETE, { method: "DELETE", body: JSON.stringify({ keys: ["API_KEY"] }) }],
  ] as const)(
    "rejects an oversized project id for %s before ownership lookup",
    async (_method, handler, init) => {
      const response = await handler(new Request("http://localhost/api", init), {
        params: Promise.resolve({ projectId: "p".repeat(201) }),
      });

      expect(response.status).toBe(400);
      expect(getCurrentUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["GET", GET, undefined, "Failed to list env vars"],
    [
      "POST",
      POST,
      { method: "POST", body: JSON.stringify({ vars: [{ key: "API_KEY", value: "x" }] }) },
      "Failed to create env vars",
    ],
    [
      "DELETE",
      DELETE,
      { method: "DELETE", body: JSON.stringify({ keys: ["API_KEY"] }) },
      "Failed to delete env vars",
    ],
  ] as const)("does not expose unexpected %s errors", async (_method, handler, init, error) => {
    const response = await handler(new Request("http://localhost/api", init), {
      params: Promise.reject(new Error("postgres://user:secret@private-db/internal")),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error });
  });

  it("rejects oversized env values before resolving project ownership", async () => {
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ vars: [{ key: "API_KEY", value: "x".repeat(100_001) }] }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
