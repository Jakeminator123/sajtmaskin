import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

async function cspFor(url: string): Promise<string> {
  const res = await proxy(new NextRequest(new URL(url)));
  // CSP_ENFORCE is unset in tests, so the policy lands on the report-only header.
  return (
    res.headers.get("Content-Security-Policy") ??
    res.headers.get("Content-Security-Policy-Report-Only") ??
    ""
  );
}

function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d === name || d.startsWith(`${name} `)) ?? ""
  );
}

describe("proxy CSP — Vercel Toolbar / Live allowlist", () => {
  it("allows vercel.live (+ Pusher + Vercel CDN) so the injected toolbar stops tripping CSP", async () => {
    const csp = await cspFor("https://sajtmaskin.example/");

    expect(directive(csp, "script-src")).toContain("https://vercel.live");
    expect(directive(csp, "frame-src")).toContain("https://vercel.live");
    expect(directive(csp, "style-src")).toContain("https://vercel.live");
    expect(directive(csp, "font-src")).toContain("https://vercel.live");
    expect(directive(csp, "font-src")).toContain("https://assets.vercel.com");
    expect(directive(csp, "connect-src")).toContain("https://vercel.live");
    expect(directive(csp, "connect-src")).toContain("wss://*.pusher.com");
  });
});
