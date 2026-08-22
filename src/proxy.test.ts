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

describe("proxy CSP — first-party third-party egress allowlist", () => {
  it("allows Google Sign-In fonts + Mixpanel so they stop flooding /api/csp-report", async () => {
    const csp = await cspFor("https://sajtmaskin.example/");

    // Google Sign-In "Google Sans" webfont + its stylesheet
    expect(directive(csp, "font-src")).toContain("https://fonts.gstatic.com");
    expect(directive(csp, "style-src")).toContain("https://fonts.googleapis.com");
    // Mixpanel client SDK event egress
    expect(directive(csp, "connect-src")).toContain("https://api-js.mixpanel.com");
  });

  it("allows only the exact Google Maps origins needed by the Maps JS loader", async () => {
    const csp = await cspFor("https://sajtmaskin.example/");
    const scriptSrc = directive(csp, "script-src");
    const connectSrc = directive(csp, "connect-src");

    expect(scriptSrc).toContain("https://maps.googleapis.com");
    expect(scriptSrc).toContain("https://maps.gstatic.com");
    expect(connectSrc).toContain("https://maps.googleapis.com");
    expect(connectSrc).toContain("https://maps.gstatic.com");

    expect(scriptSrc.split(/\s+/)).not.toContain("https:");
    expect(scriptSrc).not.toContain("https://*.googleapis.com");
    expect(scriptSrc).not.toContain("https://*.gstatic.com");
    expect(connectSrc.split(/\s+/)).not.toContain("https:");
    expect(connectSrc).not.toContain("https://*.googleapis.com");
    expect(connectSrc).not.toContain("https://*.gstatic.com");
  });

  it("puts the Google Maps allowlist in report-only CSP by default", async () => {
    const previous = process.env.CSP_ENFORCE;
    delete process.env.CSP_ENFORCE;

    try {
      const response = await proxy(new NextRequest(new URL("https://sajtmaskin.example/")));
      const reportOnly = response.headers.get("Content-Security-Policy-Report-Only") ?? "";

      expect(response.headers.get("Content-Security-Policy")).toBeNull();
      expect(directive(reportOnly, "script-src")).toContain("https://maps.googleapis.com");
      expect(directive(reportOnly, "script-src")).toContain("https://maps.gstatic.com");
      expect(directive(reportOnly, "connect-src")).toContain("https://maps.googleapis.com");
      expect(directive(reportOnly, "connect-src")).toContain("https://maps.gstatic.com");
    } finally {
      if (previous === undefined) {
        delete process.env.CSP_ENFORCE;
      } else {
        process.env.CSP_ENFORCE = previous;
      }
    }
  });

  it("keeps the Google Maps allowlist in the proxy header when enforcement is enabled", async () => {
    const previous = process.env.CSP_ENFORCE;
    process.env.CSP_ENFORCE = "true";

    try {
      // This is deliberately a proxy unit contract. next.config.ts also owns a
      // report-only header in the complete Next.js response pipeline.
      const response = await proxy(new NextRequest(new URL("https://sajtmaskin.example/")));
      const enforced = response.headers.get("Content-Security-Policy") ?? "";

      expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
      expect(directive(enforced, "script-src")).toContain("https://maps.googleapis.com");
      expect(directive(enforced, "script-src")).toContain("https://maps.gstatic.com");
      expect(directive(enforced, "connect-src")).toContain("https://maps.googleapis.com");
      expect(directive(enforced, "connect-src")).toContain("https://maps.gstatic.com");
    } finally {
      if (previous === undefined) {
        delete process.env.CSP_ENFORCE;
      } else {
        process.env.CSP_ENFORCE = previous;
      }
    }
  });
});
