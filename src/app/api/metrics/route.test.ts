import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getPrometheusMetrics = vi.hoisted(() => vi.fn(async () => "# HELP test\n# TYPE test counter\ntest 1\n"));

vi.mock("@/lib/observability/metrics", () => ({
  getPrometheusMetrics,
}));

import { GET } from "./route";

const ORIGINAL_TOKEN = process.env.SAJTMASKIN_METRICS_TOKEN;

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new Request(url, init));
}

describe("GET /api/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPrometheusMetrics.mockResolvedValue("# HELP test\n# TYPE test counter\ntest 1\n");
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) {
      delete process.env.SAJTMASKIN_METRICS_TOKEN;
    } else {
      process.env.SAJTMASKIN_METRICS_TOKEN = ORIGINAL_TOKEN;
    }
  });

  it("returns 503 metrics_disabled when SAJTMASKIN_METRICS_TOKEN is unset", async () => {
    delete process.env.SAJTMASKIN_METRICS_TOKEN;

    const res = await GET(makeReq("http://localhost/api/metrics"));

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("metrics_disabled");
    expect(res.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(getPrometheusMetrics).not.toHaveBeenCalled();
  });

  it("returns 503 metrics_disabled when SAJTMASKIN_METRICS_TOKEN is empty string", async () => {
    process.env.SAJTMASKIN_METRICS_TOKEN = "";

    const res = await GET(makeReq("http://localhost/api/metrics"));

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("metrics_disabled");
  });

  it("returns 401 when token is set but request has no auth header and no query token", async () => {
    process.env.SAJTMASKIN_METRICS_TOKEN = "secret-abc";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const res = await GET(makeReq("http://localhost/api/metrics"));

      expect(res.status).toBe(401);
      expect(await res.text()).toBe("unauthorized");
      expect(res.headers.get("www-authenticate")).toBe('Bearer realm="sajtmaskin-metrics"');
      expect(getPrometheusMetrics).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("[metrics] unauthorized request", {
        hasAuthorizationHeader: false,
        hasQueryToken: false,
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("returns 401 when bearer header carries the wrong token", async () => {
    process.env.SAJTMASKIN_METRICS_TOKEN = "secret-abc";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const res = await GET(
        makeReq("http://localhost/api/metrics", {
          headers: { authorization: "Bearer wrong-token" },
        }),
      );

      expect(res.status).toBe(401);
      expect(await res.text()).toBe("unauthorized");
      expect(getPrometheusMetrics).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("returns 401 when query token is wrong", async () => {
    process.env.SAJTMASKIN_METRICS_TOKEN = "secret-abc";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const res = await GET(makeReq("http://localhost/api/metrics?token=wrong-token"));

      expect(res.status).toBe(401);
      expect(await res.text()).toBe("unauthorized");
      expect(getPrometheusMetrics).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("returns 200 with Prometheus body when bearer header matches", async () => {
    process.env.SAJTMASKIN_METRICS_TOKEN = "secret-abc";

    const res = await GET(
      makeReq("http://localhost/api/metrics", {
        headers: { authorization: "Bearer secret-abc" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await res.text()).toBe("# HELP test\n# TYPE test counter\ntest 1\n");
    expect(getPrometheusMetrics).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with Prometheus body when ?token= query matches", async () => {
    process.env.SAJTMASKIN_METRICS_TOKEN = "secret-abc";

    const res = await GET(makeReq("http://localhost/api/metrics?token=secret-abc"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(await res.text()).toBe("# HELP test\n# TYPE test counter\ntest 1\n");
    expect(getPrometheusMetrics).toHaveBeenCalledTimes(1);
  });

  it("trims whitespace around the bearer token", async () => {
    process.env.SAJTMASKIN_METRICS_TOKEN = "secret-abc";

    const res = await GET(
      makeReq("http://localhost/api/metrics", {
        headers: { authorization: "  Bearer   secret-abc  " },
      }),
    );

    expect(res.status).toBe(200);
  });
});
