import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { validateAndUpgradeDeps } from "./dep-version-validator";

/**
 * Mock-strategi: vi monkey-patchar `globalThis.fetch` så validatorn slipper
 * gå mot riktiga npmjs.org. Cachen i `npm-registry.ts` skriver mot tmpdir;
 * för att garantera att cache aldrig stör mock-fetch använder vi en unik
 * UUID-prefix per test så namnet är garanterat ofångat.
 */

const uniq = () => `fake-pkg-${randomUUID()}`;

interface MockMeta {
  latest?: string;
  versions?: string[];
  notFound?: boolean;
  network?: "fail";
}

function mockNpmFetch(map: Record<string, MockMeta>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    const match = url.match(/registry\.npmjs\.org\/(.+)$/);
    const pkg = match ? decodeURIComponent(match[1].replace(/%2F/g, "/")) : "";
    const meta = map[pkg];
    if (!meta || meta.notFound) {
      return new Response("Not found", { status: 404 });
    }
    if (meta.network === "fail") {
      throw new Error("network down");
    }
    const body = {
      "dist-tags": { latest: meta.latest },
      versions: Object.fromEntries((meta.versions ?? []).map((v) => [v, {}])),
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("dep-version-validator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bumps an invalid major to ^latest", async () => {
    const pkg = uniq();
    mockNpmFetch({
      [pkg]: { latest: "0.469.0", versions: ["0.468.0", "0.469.0"] },
    });

    const result = await validateAndUpgradeDeps({
      dependencies: { [pkg]: "^1" },
    });

    expect(result.dependencies[pkg]).toBe("^0.469.0");
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]).toMatchObject({
      pkg,
      from: "^1",
      to: "^0.469.0",
      field: "dependencies",
    });
  });

  it("leaves a valid spec untouched", async () => {
    const pkg = uniq();
    mockNpmFetch({
      [pkg]: { latest: "4.1.0", versions: ["4.0.0", "4.1.0"] },
    });

    const result = await validateAndUpgradeDeps({
      dependencies: { [pkg]: "^4" },
    });

    expect(result.dependencies[pkg]).toBe("^4");
    expect(result.corrections).toHaveLength(0);
  });

  it("does not change spec when registry is unreachable", async () => {
    const pkg = uniq();
    mockNpmFetch({
      [pkg]: { network: "fail" },
    });

    const result = await validateAndUpgradeDeps({
      dependencies: { [pkg]: "^99" },
    });

    expect(result.dependencies[pkg]).toBe("^99");
    expect(result.corrections).toHaveLength(0);
  });

  it("validates devDependencies separately", async () => {
    const pkg = uniq();
    mockNpmFetch({
      [pkg]: { latest: "5.2.0", versions: ["5.0.0", "5.1.0", "5.2.0"] },
    });

    const result = await validateAndUpgradeDeps({
      devDependencies: { [pkg]: "^9" },
    });

    expect(result.devDependencies[pkg]).toBe("^5.2.0");
    expect(result.corrections[0]?.field).toBe("devDependencies");
  });

  it("returns empty result for empty input", async () => {
    const result = await validateAndUpgradeDeps({});
    expect(result.dependencies).toEqual({});
    expect(result.devDependencies).toEqual({});
    expect(result.corrections).toEqual([]);
  });
});
