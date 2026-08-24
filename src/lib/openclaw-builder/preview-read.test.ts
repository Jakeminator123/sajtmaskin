import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOG_LIMIT,
  MAX_LOG_LIMIT,
  PREVIEW_READINESS,
  getPreviewLogs,
  getPreviewStatus,
  type PassivePreviewSession,
  type PreviewLogLine,
  type PreviewReadIdentity,
} from "./preview-read";

function identity(
  overrides: Partial<PreviewReadIdentity> = {},
): PreviewReadIdentity {
  return {
    tenantId: "tenant-1",
    chatId: "chat-1",
    versionId: "ver-1",
    filesRevision: "rev-1",
    ...overrides,
  };
}

function session(
  overrides: Partial<PassivePreviewSession> = {},
): PassivePreviewSession {
  return {
    status: "running",
    versionId: "ver-1",
    filesRevision: "rev-1",
    expiresAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

function line(ts: string, message: string): PreviewLogLine {
  return { ts, message };
}

function statusInput(
  overrides: {
    job?: PreviewReadIdentity;
    requester?: PreviewReadIdentity;
    session?: PassivePreviewSession;
  } = {},
) {
  return {
    job: overrides.job ?? identity(),
    requester: overrides.requester ?? identity(),
    session: overrides.session ?? session(),
  };
}

function logsInput(
  overrides: {
    job?: PreviewReadIdentity;
    requester?: PreviewReadIdentity;
    session?: PassivePreviewSession;
    lines?: PreviewLogLine[];
    limit?: number;
  } = {},
) {
  return {
    job: overrides.job ?? identity(),
    requester: overrides.requester ?? identity(),
    session: overrides.session ?? session(),
    lines: overrides.lines ?? [line("2026-08-24T00:00:00.000Z", "ready")],
    ...(overrides.limit !== undefined ? { limit: overrides.limit } : {}),
  };
}

describe("getPreviewStatus", () => {
  it("returns running status when job, requester, and session align", () => {
    const result = getPreviewStatus(statusInput());
    expect(result).toEqual({
      ok: true,
      tool: "preview.status",
      status: "running",
      readiness: PREVIEW_READINESS,
      versionMatches: true,
      revisionMatches: true,
    });
  });

  it("always reports readiness as not_available_without_side_effects", () => {
    const running = getPreviewStatus(statusInput());
    const missing = getPreviewStatus(
      statusInput({
        session: session({
          status: "missing",
          versionId: null,
          filesRevision: null,
        }),
      }),
    );
    expect(running.ok).toBe(true);
    expect(missing.ok).toBe(true);
    if (running.ok) {
      expect(running.readiness).toBe("not_available_without_side_effects");
    }
    if (missing.ok) {
      expect(missing.readiness).toBe("not_available_without_side_effects");
      expect(missing.status).toBe("missing");
      expect(missing.versionMatches).toBeNull();
      expect(missing.revisionMatches).toBeNull();
    }
  });

  it("returns identity_mismatch when tenant, chat, version, or revision differs", () => {
    expect(
      getPreviewStatus(
        statusInput({ requester: identity({ tenantId: "tenant-other" }) }),
      ),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getPreviewStatus(
        statusInput({ requester: identity({ chatId: "chat-other" }) }),
      ),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getPreviewStatus(
        statusInput({ requester: identity({ versionId: "ver-other" }) }),
      ),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getPreviewStatus(
        statusInput({ requester: identity({ filesRevision: "rev-other" }) }),
      ),
    ).toEqual({ ok: false, code: "identity_mismatch" });
  });

  it("returns invalid_input for empty or whitespace-only ids", () => {
    for (const key of ["tenantId", "chatId", "versionId", "filesRevision"] as const) {
      expect(
        getPreviewStatus(statusInput({ job: identity({ [key]: "" }) })),
      ).toEqual({ ok: false, code: "invalid_input" });
      expect(
        getPreviewStatus(statusInput({ requester: identity({ [key]: "   " }) })),
      ).toEqual({ ok: false, code: "invalid_input" });
    }
  });

  it("returns version_mismatch when the session version differs", () => {
    const result = getPreviewStatus(
      statusInput({ session: session({ versionId: "ver-old" }) }),
    );
    expect(result).toEqual({
      ok: true,
      tool: "preview.status",
      status: "version_mismatch",
      readiness: PREVIEW_READINESS,
      versionMatches: false,
      revisionMatches: true,
    });
  });

  it("returns revision_mismatch when the session revision differs", () => {
    const result = getPreviewStatus(
      statusInput({ session: session({ filesRevision: "rev-old" }) }),
    );
    expect(result).toEqual({
      ok: true,
      tool: "preview.status",
      status: "revision_mismatch",
      readiness: PREVIEW_READINESS,
      versionMatches: true,
      revisionMatches: false,
    });
  });

  it("never returns a preview URL, session id, host credential, or raw token", () => {
    const stuffed = {
      ...session(),
      previewUrl: "https://preview.example.invalid/app",
      sessionId: "sess-secret",
      hostToken: "Bearer fly-secret",
      credential: "sk-live-abc",
    };
    const result = getPreviewStatus(
      statusInput({ session: stuffed as PassivePreviewSession }),
    );
    expect(result.ok).toBe(true);
    const blob = JSON.stringify(result);
    expect(blob).not.toContain("https://");
    expect(blob).not.toContain("preview.example");
    expect(blob).not.toContain("sess-secret");
    expect(blob).not.toContain("fly-secret");
    expect(blob).not.toContain("sk-live");
    if (result.ok) {
      expect(result).not.toHaveProperty("previewUrl");
      expect(result).not.toHaveProperty("sessionId");
      expect(result).not.toHaveProperty("url");
      expect(Object.keys(result).sort()).toEqual(
        [
          "ok",
          "readiness",
          "revisionMatches",
          "status",
          "tool",
          "versionMatches",
        ].sort(),
      );
    }
  });
});

describe("getPreviewLogs", () => {
  it("returns scrubbed lines when the session matches", () => {
    const result = getPreviewLogs(
      logsInput({
        lines: [
          line("t1", "boot"),
          line("t2", "ready"),
        ],
      }),
    );
    expect(result).toEqual({
      ok: true,
      tool: "preview.logs",
      available: true,
      reason: "ok",
      lines: [
        { ts: "t1", message: "boot" },
        { ts: "t2", message: "ready" },
      ],
      truncated: false,
    });
  });

  it("returns identity_mismatch when requester identity differs", () => {
    expect(
      getPreviewLogs(
        logsInput({ requester: identity({ tenantId: "tenant-other" }) }),
      ),
    ).toEqual({ ok: false, code: "identity_mismatch" });
  });

  it("returns invalid_input for empty ids", () => {
    expect(
      getPreviewLogs(logsInput({ job: identity({ chatId: "" }) })),
    ).toEqual({ ok: false, code: "invalid_input" });
  });

  it("returns no_session and no lines when the session is missing", () => {
    const result = getPreviewLogs(
      logsInput({
        session: session({
          status: "missing",
          versionId: null,
          filesRevision: null,
        }),
        lines: [line("t1", "stale leftover")],
      }),
    );
    expect(result).toEqual({
      ok: true,
      tool: "preview.logs",
      available: false,
      reason: "no_session",
      lines: [],
      truncated: false,
    });
  });

  it("returns version_mismatch with no lines when the session version differs", () => {
    const result = getPreviewLogs(
      logsInput({
        session: session({ versionId: "ver-old" }),
        lines: [line("t1", "should not leak")],
      }),
    );
    expect(result).toEqual({
      ok: true,
      tool: "preview.logs",
      available: false,
      reason: "version_mismatch",
      lines: [],
      truncated: false,
    });
  });

  it("returns revision_mismatch with no lines when the session revision differs", () => {
    const result = getPreviewLogs(
      logsInput({
        session: session({ filesRevision: "rev-old" }),
        lines: [line("t1", "should not leak")],
      }),
    );
    expect(result).toEqual({
      ok: true,
      tool: "preview.logs",
      available: false,
      reason: "revision_mismatch",
      lines: [],
      truncated: false,
    });
  });

  it("scrubs bearer tokens, sk/rk/whsec secrets, PEM keys, and https URLs", () => {
    const result = getPreviewLogs(
      logsInput({
        lines: [
          line("t1", "auth Bearer fly-abc123.token"),
          line("t2", "openai sk-proj-SUPERSECRET and stripe rk-live-XYZ"),
          line("t3", "webhook whsec_should_stay webhook whsec-abcDEF"),
          line(
            "t4",
            "key -----BEGIN RSA PRIVATE KEY-----\nMIISECRET\n-----END RSA PRIVATE KEY----- done",
          ),
          line("t5", "open https://preview-host.fly.dev/sess/abc?token=1 now"),
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.available).toBe(true);
    const blob = result.lines.map((entry) => entry.message).join("\n");
    expect(blob).not.toContain("fly-abc123");
    expect(blob).not.toContain("sk-proj");
    expect(blob).not.toContain("SUPERSECRET");
    expect(blob).not.toContain("rk-live");
    expect(blob).not.toContain("whsec-abcDEF");
    expect(blob).not.toContain("BEGIN RSA");
    expect(blob).not.toContain("MIISECRET");
    expect(blob).not.toContain("https://");
    expect(blob).not.toContain("preview-host.fly.dev");
    expect(blob).toContain("[redacted]");
    expect(result.lines[0]?.message).toBe("auth Bearer [redacted]");
    expect(result.lines[1]?.message).toContain("[redacted]");
    expect(result.lines[4]?.message).toBe("open [redacted] now");
  });

  it("drops messages that are empty after scrub and does not invent lines", () => {
    const result = getPreviewLogs(
      logsInput({
        lines: [
          line("t1", "   "),
          line("t2", "https://only.example.invalid/secret"),
          line("t3", "kept"),
          { ts: 12, message: "bad-ts" } as unknown as PreviewLogLine,
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.lines).toEqual([
      { ts: "t2", message: "[redacted]" },
      { ts: "t3", message: "kept" },
    ]);
    expect(result.truncated).toBe(false);
  });

  it("defaults to 20 lines, caps at 40, and marks truncation", () => {
    const many = Array.from({ length: 45 }, (_, index) =>
      line(`t${index}`, `line-${index}`),
    );

    const defaulted = getPreviewLogs(logsInput({ lines: many }));
    expect(defaulted.ok).toBe(true);
    if (!defaulted.ok) throw new Error("expected ok");
    expect(defaulted.lines).toHaveLength(DEFAULT_LOG_LIMIT);
    expect(defaulted.lines[0]?.message).toBe("line-25");
    expect(defaulted.lines[19]?.message).toBe("line-44");
    expect(defaulted.truncated).toBe(true);

    const capped = getPreviewLogs(logsInput({ lines: many, limit: 100 }));
    expect(capped.ok).toBe(true);
    if (!capped.ok) throw new Error("expected ok");
    expect(capped.lines).toHaveLength(MAX_LOG_LIMIT);
    expect(capped.lines[0]?.message).toBe("line-5");
    expect(capped.truncated).toBe(true);

    const exact = getPreviewLogs(
      logsInput({
        lines: many.slice(0, DEFAULT_LOG_LIMIT),
      }),
    );
    expect(exact.ok).toBe(true);
    if (!exact.ok) throw new Error("expected ok");
    expect(exact.lines).toHaveLength(DEFAULT_LOG_LIMIT);
    expect(exact.truncated).toBe(false);
  });

  it("returns invalid_input for a non-positive or non-integer limit", () => {
    expect(getPreviewLogs(logsInput({ limit: 0 }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(getPreviewLogs(logsInput({ limit: 1.5 }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });
});
