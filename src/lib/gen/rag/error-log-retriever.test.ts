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
          routePath: null,
          variantId: null,
          capabilityIds: [],
          generationMode: null,
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
          routePath: null,
          variantId: null,
          capabilityIds: [],
          generationMode: null,
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

  it("reranks same fault and capability above plain text matches", () => {
    writeSnapshot([
      {
        id: "row-0",
        text: "react import missing generic",
        payload: {
          time: null,
          phase: "post-gen",
          fault: "react-import-missing",
          faultText: "Missing React import",
          fixText: "Added import",
          scaffoldId: "base-nextjs",
          routePath: "/",
          variantId: null,
          capabilityIds: [],
          generationMode: "init",
          lineageHash: null,
          result: "fixed",
        },
      },
      {
        id: "row-1",
        text: "react import missing generic",
        payload: {
          time: null,
          phase: "post-gen",
          fault: "undefined-jsx-symbol",
          faultText: "Missing symbol in 3D scene",
          fixText: "Imported missing symbol",
          scaffoldId: "landing-page",
          routePath: "/",
          variantId: null,
          capabilityIds: ["visual-3d"],
          generationMode: "followup",
          lineageHash: null,
          result: "fixed",
        },
      },
    ]);
    const hits = retrieveSimilarFailures({
      prompt: "react import missing generic",
      faultType: "undefined-jsx-symbol",
      scaffoldId: "landing-page",
      capabilityIds: ["visual-3d"],
      generationMode: "followup",
    });
    expect(hits[0]).toMatchObject({
      fault: "undefined-jsx-symbol",
      scaffoldId: "landing-page",
      capabilityIds: ["visual-3d"],
    });
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
    expect(joined.length).toBeLessThanOrEqual(600);
    expect(joined).toContain("react-import-missing");
  });

  it("defaults the prompt block to the top 3 similar failures", () => {
    writeSnapshot(
      Array.from({ length: 5 }, (_, index) => ({
        id: `row-${index}`,
        text: `react import missing symbol ${index}`,
        payload: {
          time: null,
          phase: "post-gen",
          fault: `fault-${index}`,
          faultText: `Missing React import on component ${index}`,
          fixText: "Added import React from react",
          scaffoldId: null,
          lineageHash: null,
          result: "fixed",
        },
      })),
    );
    const lines = renderErrorLogRagBlockLines({ prompt: "react import missing symbol" });
    const itemLines = lines.filter((line) => line.startsWith("- `fault-"));
    expect(itemLines.length).toBe(3);
  });

  it("handles legacy malformed payload fields defensively", () => {
    writeSnapshot([
      {
        id: "row-0",
        text: "missing symbol",
        payload: {
          time: null,
          phase: "post-gen",
          fault: null,
          faultText: null,
          fixText: null,
          scaffoldId: "landing-page",
          capabilityIds: "visual-3d",
          lineageHash: null,
          result: null,
        },
      },
    ]);

    const hits = retrieveSimilarFailures({
      prompt: "missing symbol",
      capabilityIds: ["visual-3d"],
    });
    expect(hits[0]).toMatchObject({
      fault: "unknown_fault",
      faultText: "",
      capabilityIds: [],
    });
    expect(renderErrorLogRagBlockLines({ prompt: "missing symbol" }).join("\n")).toContain(
      "(no detail)",
    );
  });
});
