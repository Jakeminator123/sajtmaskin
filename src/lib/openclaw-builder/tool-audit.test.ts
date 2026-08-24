import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  TOOL_AUDIT_TOOLS,
  createToolAuditEvent,
  type ToolAuditDecision,
} from "./tool-audit";

const SECRET = "unit-test-builder-tool-audit-secret";
const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";

const EVENT_KEYS = [
  "schemaVersion",
  "type",
  "tool",
  "decision",
  "code",
  "jobId",
  "tenantHash",
  "versionId",
  "filesRevision",
  "durationMs",
  "requestHash",
] as const;

function validInput(
  overrides: Partial<Parameters<typeof createToolAuditEvent>[0]> = {},
): Parameters<typeof createToolAuditEvent>[0] {
  return {
    secret: SECRET,
    tool: "job.get",
    decision: "allow",
    jobId: "job-1",
    tenantId: TENANT_A,
    versionId: "version-1",
    filesRevision: "rev-1",
    durationMs: 12,
    request: { path: "src/app/page.tsx", limit: 20 },
    ...overrides,
  };
}

function expectedTenantHash(secret: string, tenantId: string): string {
  return createHmac("sha256", secret).update(tenantId, "utf8").digest("hex");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) continue;
      sorted[key] = sortKeys(child);
    }
    return sorted;
  }
  return value;
}

function expectedRequestHash(request: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortKeys(request)), "utf8").digest("hex");
}

describe("createToolAuditEvent allow", () => {
  it("builds an allow event with hashed tenant and request, code null", () => {
    const request = { limit: 20, path: "src/app/page.tsx" };
    const result = createToolAuditEvent(validInput({ request }));

    expect(result).toEqual({
      ok: true,
      event: {
        schemaVersion: 1,
        type: "tool.policy_decided",
        tool: "job.get",
        decision: "allow",
        code: null,
        jobId: "job-1",
        tenantHash: expectedTenantHash(SECRET, TENANT_A),
        versionId: "version-1",
        filesRevision: "rev-1",
        durationMs: 12,
        requestHash: expectedRequestHash(request),
      },
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.event.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.event.tenantHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts every known read-only tool", () => {
    for (const tool of TOOL_AUDIT_TOOLS) {
      const result = createToolAuditEvent(validInput({ tool }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.event.tool).toBe(tool);
    }
  });
});

describe("createToolAuditEvent deny", () => {
  it("builds a deny event with the supplied code", () => {
    const result = createToolAuditEvent(
      validInput({ decision: "deny", code: "tool_not_allowed" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.event.decision).toBe("deny");
    expect(result.event.code).toBe("tool_not_allowed");
  });

  it("rejects deny without a code", () => {
    expect(createToolAuditEvent(validInput({ decision: "deny" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createToolAuditEvent(validInput({ decision: "deny", code: null }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createToolAuditEvent(validInput({ decision: "deny", code: "" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("rejects deny codes that are too long or badly shaped", () => {
    expect(
      createToolAuditEvent(validInput({ decision: "deny", code: "ToolNotAllowed" })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      createToolAuditEvent(validInput({ decision: "deny", code: "tool-not-allowed" })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      createToolAuditEvent(validInput({ decision: "deny", code: "a".repeat(65) })),
    ).toEqual({ ok: false, code: "invalid_input" });
  });

  it("rejects allow when a code is supplied", () => {
    expect(createToolAuditEvent(validInput({ code: "tool_not_allowed" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });
});

describe("createToolAuditEvent validation", () => {
  it("rejects an empty or whitespace secret", () => {
    expect(createToolAuditEvent(validInput({ secret: "" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createToolAuditEvent(validInput({ secret: "   " }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("rejects unknown and write tools", () => {
    for (const tool of ["apply_patch", "project.write_file", "job.get ", "JOB.GET", ""]) {
      expect(createToolAuditEvent(validInput({ tool }))).toEqual({
        ok: false,
        code: "invalid_input",
      });
    }
  });

  it("rejects a non-integer or out-of-range durationMs", () => {
    for (const durationMs of [-1, 1.5, Number.NaN, 3_600_001, Number.POSITIVE_INFINITY]) {
      expect(createToolAuditEvent(validInput({ durationMs }))).toEqual({
        ok: false,
        code: "invalid_input",
      });
    }
    expect(createToolAuditEvent(validInput({ durationMs: 0 })).ok).toBe(true);
    expect(createToolAuditEvent(validInput({ durationMs: 3_600_000 })).ok).toBe(true);
  });

  it("rejects empty identity fields", () => {
    for (const field of ["jobId", "tenantId", "versionId", "filesRevision"] as const) {
      expect(createToolAuditEvent(validInput({ [field]: "" }))).toEqual({
        ok: false,
        code: "invalid_input",
      });
      expect(createToolAuditEvent(validInput({ [field]: "   " }))).toEqual({
        ok: false,
        code: "invalid_input",
      });
    }
  });
});

describe("createToolAuditEvent redaction", () => {
  it("hashes tenants differently and never stores the raw id", () => {
    const a = createToolAuditEvent(validInput({ tenantId: TENANT_A }));
    const b = createToolAuditEvent(validInput({ tenantId: TENANT_B }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("expected ok");

    expect(a.event.tenantHash).not.toBe(b.event.tenantHash);
    expect(a.event.tenantHash).not.toBe(TENANT_A);
    expect(b.event.tenantHash).not.toBe(TENANT_B);
    expect(JSON.stringify(a.event)).not.toContain(TENANT_A);
    expect(JSON.stringify(b.event)).not.toContain(TENANT_B);
    expect(a.event.tenantHash).toBe(expectedTenantHash(SECRET, TENANT_A));
    expect(b.event.tenantHash).toBe(expectedTenantHash(SECRET, TENANT_B));
  });

  it("produces a stable requestHash regardless of object key order", () => {
    const left = createToolAuditEvent(
      validInput({ request: { path: "src/lib/x.ts", offset: 0, limit: 10 } }),
    );
    const right = createToolAuditEvent(
      validInput({ request: { limit: 10, offset: 0, path: "src/lib/x.ts" } }),
    );
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) throw new Error("expected ok");
    expect(left.event.requestHash).toBe(right.event.requestHash);
    expect(left.event.requestHash).toBe(
      expectedRequestHash({ limit: 10, offset: 0, path: "src/lib/x.ts" }),
    );
  });

  it("rejects secret-like request payloads instead of hashing them", () => {
    const leaks: unknown[] = [
      { authorization: "Bearer abc" },
      { apiKey: "sk-proj-not-a-real-key" },
      { pem: "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----" },
      { note: "private_key material" },
    ];
    for (const request of leaks) {
      expect(createToolAuditEvent(validInput({ request }))).toEqual({
        ok: false,
        code: "invalid_input",
      });
    }
  });

  it("keeps only allowlisted fields and never copies file or prompt text", () => {
    const prompt = "Write a landing page for a bakery";
    const fileText = "export default function Page() { return <h1>Hemlig</h1>; }";
    const result = createToolAuditEvent(
      validInput({
        request: {
          path: "src/app/page.tsx",
          prompt,
          contents: fileText,
          file: fileText,
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    expect(Object.keys(result.event).sort()).toEqual([...EVENT_KEYS].sort());
    const serialized = JSON.stringify(result.event);
    expect(serialized).not.toContain(prompt);
    expect(serialized).not.toContain(fileText);
    expect(serialized).not.toContain("Hemlig");
    expect(serialized).not.toContain(TENANT_A);
    expect(serialized).not.toContain("src/app/page.tsx");
    expect(result.event).not.toHaveProperty("prompt");
    expect(result.event).not.toHaveProperty("contents");
    expect(result.event).not.toHaveProperty("file");
    expect(result.event).not.toHaveProperty("tenantId");
    expect(result.event).not.toHaveProperty("request");
  });

  it("rejects prototype-polluting request keys instead of hashing them", () => {
    const polluted = JSON.parse('{"__proto__":{"admin":true},"path":"src/app.ts"}');
    expect(createToolAuditEvent(validInput({ request: polluted }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("rejects requests that cannot be canonicalized", () => {
    expect(
      createToolAuditEvent(validInput({ request: { run: () => "secret" } })),
    ).toEqual({ ok: false, code: "invalid_input" });
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(createToolAuditEvent(validInput({ request: circular }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });
});

describe("createToolAuditEvent decisions", () => {
  it.each(["allow", "deny"] as const)("only accepts %s as a decision", (decision: ToolAuditDecision) => {
    const result = createToolAuditEvent(
      validInput({
        decision,
        code: decision === "deny" ? "stale_revision" : null,
      }),
    );
    expect(result.ok).toBe(true);
  });
});
