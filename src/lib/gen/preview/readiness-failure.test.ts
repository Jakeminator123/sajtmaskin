import { describe, expect, it } from "vitest";
import {
  classifyReadinessFailure,
  isUnverifiedReadinessFailure,
  presentReadinessFailure,
  splitReadinessFailureDetail,
} from "./readiness-failure";

// Verbatim host verdict from prod chat 28af0778 (2026-09-04, version v2).
const EMPTY_BODY_VERDICT =
  "Runtime served HTML with an empty body for 90000ms (not ready): HTTP 200 HTML but body text still empty (compiling or blank page)\n" +
  "Last Next.js output:\n" +
  " GET / 200 in 35ms (next.js: 1.9ms, application-code: 33ms)\n" +
  " GET / 200 in 31ms (next.js: 2ms, application-code: 28ms)\n" +
  " GET / 200 in 30ms (next.js: 1.6ms, application-code: 28ms)";

const OVERLAY_VERDICT =
  "Runtime is serving a Next.js build error overlay (not ready): Module not found: Can't resolve '@/components/missing'";

describe("classifyReadinessFailure", () => {
  it.each([
    [EMPTY_BODY_VERDICT, "empty_body"],
    [
      "Runtime did not become ready within 600000ms. Last error: HTTP 200 HTML but body text still empty (compiling or blank page)",
      "empty_body",
    ],
    [OVERLAY_VERDICT, "build_error_overlay"],
    ["Runtime never accepted HTTP within 120000ms (not ready): fetch failed", "http_not_accepted"],
    [
      "Preview runtime exited cleanly 3 times within 60 seconds before readiness completed.",
      "clean_exit_loop",
    ],
    ["npm install --no-audit --include=dev failed with exit code 254 (no_output)", "boot_failed"],
    ["Runtime did not become ready within 600000ms. Last error: HTTP 404", "deadline"],
    ["", "unknown"],
    [null, "unknown"],
    ["something else entirely", "unknown"],
  ])("classifies %j as %s", (message, expected) => {
    expect(classifyReadinessFailure(message)).toBe(expected);
  });

  it("only empty_body counts as unverified (not proven broken)", () => {
    expect(isUnverifiedReadinessFailure("empty_body")).toBe(true);
    expect(isUnverifiedReadinessFailure("build_error_overlay")).toBe(false);
    expect(isUnverifiedReadinessFailure("http_not_accepted")).toBe(false);
    expect(isUnverifiedReadinessFailure("unknown")).toBe(false);
  });
});

describe("splitReadinessFailureDetail", () => {
  it("separates the one-line summary from the appended Next.js log tail", () => {
    const { summary, logTail } = splitReadinessFailureDetail(EMPTY_BODY_VERDICT);
    expect(summary).toBe(
      "Runtime served HTML with an empty body for 90000ms (not ready): HTTP 200 HTML but body text still empty (compiling or blank page)",
    );
    expect(logTail).toMatch(/^GET \/ 200 in 35ms/);
    expect(logTail?.split("\n")).toHaveLength(3);
  });

  it("returns the whole text as summary when there is no tail", () => {
    expect(splitReadinessFailureDetail(OVERLAY_VERDICT)).toEqual({
      summary: OVERLAY_VERDICT,
      logTail: null,
    });
    expect(splitReadinessFailureDetail(null)).toEqual({ summary: "", logTail: null });
  });
});

describe("presentReadinessFailure", () => {
  it("presents an empty-body verdict as an info notice without any log lines in the copy", () => {
    const presented = presentReadinessFailure(EMPTY_BODY_VERDICT);
    expect(presented.kind).toBe("empty_body");
    expect(presented.severity).toBe("info");
    // No developer vocabulary in what the site owner reads.
    expect(presented.title).not.toMatch(/byggfel|build|tier-2|stage/i);
    expect(presented.message).not.toMatch(/GET \/|200 in|next\.js|Runtime served/i);
    expect(presented.message).toMatch(/laddas ändå/i);
    // The raw text survives only as collapsed detail.
    expect(presented.detail).toContain("GET / 200 in 35ms");
  });

  it("presents a build-error overlay as an error with the compile message but without host boilerplate", () => {
    const presented = presentReadinessFailure(OVERLAY_VERDICT);
    expect(presented.kind).toBe("build_error_overlay");
    expect(presented.severity).toBe("error");
    expect(presented.title).toBe("Koden kompilerar inte");
    expect(presented.message).toContain("Module not found");
    expect(presented.message).not.toContain("Runtime is serving");
  });

  it("falls back to a generic error for unknown verdicts and keeps the raw text as detail", () => {
    const presented = presentReadinessFailure("weird host message");
    expect(presented.severity).toBe("error");
    expect(presented.detail).toBe("weird host message");
    expect(presented.message).not.toContain("weird host message");
  });

  it("handles a missing detail without throwing", () => {
    const presented = presentReadinessFailure(null);
    expect(presented.kind).toBe("unknown");
    expect(presented.severity).toBe("error");
    expect(presented.detail).toBeNull();
  });
});
