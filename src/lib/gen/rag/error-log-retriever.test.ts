import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

const featuresMock = vi.hoisted(() => ({
  useErrorLogRag: true,
}));

vi.mock("@/lib/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config")>("@/lib/config");
  return {
    ...actual,
    FEATURES: {
      ...actual.FEATURES,
      get useErrorLogRag() {
        return featuresMock.useErrorLogRag;
      },
    },
  };
});

import {
  ERROR_LOG_INDEX_PATH,
  __resetErrorLogRetrieverCacheForTests,
  renderErrorLogRagBlockLines,
  retrieveSimilarFailures,
} from "./error-log-retriever";

const SNAPSHOT_DIR = path.dirname(ERROR_LOG_INDEX_PATH);
let originalSnapshot: string | null = null;

function writeSnapshot(rows: Array<{
  id: string;
  text: string;
  payload: Record<string, unknown>;
}>) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(
    ERROR_LOG_INDEX_PATH,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      documents: rows,
    }),
    "utf8",
  );
}

describe("error-log retriever", () => {
  beforeEach(() => {
    featuresMock.useErrorLogRag = true;
    if (fs.existsSync(ERROR_LOG_INDEX_PATH)) {
      originalSnapshot = fs.readFileSync(ERROR_LOG_INDEX_PATH, "utf8");
    } else {
      originalSnapshot = null;
    }
    __resetErrorLogRetrieverCacheForTests();
  });
  afterEach(() => {
    if (originalSnapshot !== null) {
      fs.writeFileSync(ERROR_LOG_INDEX_PATH, originalSnapshot, "utf8");
    } else if (fs.existsSync(ERROR_LOG_INDEX_PATH)) {
      fs.unlinkSync(ERROR_LOG_INDEX_PATH);
    }
    __resetErrorLogRetrieverCacheForTests();
  });

  it("returns [] when feature flag off", () => {
    featuresMock.useErrorLogRag = false;
    writeSnapshot([
      {
        id: "row-0",
        text: "missing react import",
        payload: { fault: "react-import-missing", faultText: "Missing React import" },
      },
    ]);
    expect(retrieveSimilarFailures({ prompt: "react import" })).toEqual([]);
    expect(renderErrorLogRagBlockLines({ prompt: "react import" })).toEqual([]);
  });

  it("returns [] when no snapshot file exists", () => {
    if (fs.existsSync(ERROR_LOG_INDEX_PATH)) fs.unlinkSync(ERROR_LOG_INDEX_PATH);
    __resetErrorLogRetrieverCacheForTests();
    expect(retrieveSimilarFailures({ prompt: "react import" })).toEqual([]);
  });

  it("retrieves matching rows ordered by score", () => {
    writeSnapshot([
      {
        id: "row-0",
        text: "missing react import in src app page tsx",
        payload: {
          time: null,
          phase: "post-gen",
          fault: "react-import-missing",
          faultText: "Missing React import on page.tsx",
          fixText: "Added import React from react",
          scaffoldId: "landing-page",
          lineageHash: null,
          result: "fixed",
        },
      },
      {
        id: "row-1",
        text: "tailwind apply unknown utility class layer",
        payload: {
          time: null,
          phase: "post-gen",
          fault: "tailwind-apply-unknown",
          faultText: "Unknown utility in @apply",
          fixText: null,
          scaffoldId: "landing-page",
          lineageHash: null,
          result: null,
        },
      },
    ]);
    const hits = retrieveSimilarFailures({
      prompt: "react import missing on page",
      scaffoldId: "landing-page",
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].fault).toBe("react-import-missing");
  });

  it("renderErrorLogRagBlockLines outputs a header + items + respects budget", () => {
    writeSnapshot([
      {
        id: "row-0",
        text: "missing react import",
        payload: {
          time: null,
          phase: "post-gen",
          fault: "react-import-missing",
          faultText: "Missing React import on page.tsx",
          fixText: "Added import React from react",
          scaffoldId: null,
          lineageHash: null,
          result: "fixed",
        },
      },
    ]);
    const lines = renderErrorLogRagBlockLines({ prompt: "react import" });
    expect(lines[0]).toBe("### Lessons from similar past builds");
    const joined = lines.join("\n");
    expect(joined.length).toBeLessThanOrEqual(800);
    expect(joined).toContain("react-import-missing");
  });
});
