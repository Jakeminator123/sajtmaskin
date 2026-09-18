import { describe, expect, it, vi } from "vitest";
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

describe("proxy auth gate — customer portal routes", () => {
  it.each(["/projects", "/projects/abc123", "/projects/abc123/", "/buy-credits", "/konto"])(
    "redirects an anonymous visitor away from %s",
    async (path) => {
      const res = await proxy(new NextRequest(new URL(`https://sajtmaskin.example${path}`)));

      // `AUTH_REQUIRED_PATHS` is an exact-match set, so the dynamic site view
      // would fall through without the prefix rule. A signed-out visitor must
      // not reach the page at all.
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://sajtmaskin.example/");
    },
  );

  it("does not treat /konto as a prefix — only the exact path is gated", async () => {
    const res = await proxy(
      new NextRequest(new URL("https://sajtmaskin.example/konto/installningar")),
    );

    expect(res.status).not.toBe(307);
  });

  it("does not gate unrelated public routes that merely start similarly", async () => {
    const res = await proxy(new NextRequest(new URL("https://sajtmaskin.example/templates")));

    expect(res.status).not.toBe(307);
  });
});

describe("proxy exact-Origin guard", () => {
  const browserMutations = [
    "/api/projects",
    "/api/engine/chats/stream",
    "/api/media/upload",
    "/api/auth/logout",
    "/api/github/export",
  ];

  it.each(browserMutations)("allows %s from the exact preview portal origin", async (path) => {
    const res = await proxy(
      new NextRequest(`https://sajtmaskin.vercel.app${path}`, {
        method: "POST",
        headers: {
          origin: "https://preview.sajtmaskin.se",
          cookie: "__Host-sajtmaskin_auth=signed",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows browser mutations from Vercel's persistent preview-branch origin", async () => {
    const branchOrigin = "https://sajtmaskin-git-preview-jakeminator123s-projects.vercel.app";
    vi.stubEnv("VERCEL_BRANCH_URL", new URL(branchOrigin).hostname);

    try {
      const res = await proxy(
        new NextRequest("https://sajtmaskin.vercel.app/api/projects", {
          method: "POST",
          headers: {
            origin: branchOrigin,
            cookie: "__Host-sajtmaskin_auth=signed",
          },
        }),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("allows a same-port loopback alias in development but not another port", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "development");

    try {
      const allowed = await proxy(
        new NextRequest("http://127.0.0.1:3000/api/projects", {
          method: "POST",
          headers: {
            origin: "http://127.0.0.1:3000",
            cookie: "sajtmaskin_session=local",
          },
        }),
      );
      const denied = await proxy(
        new NextRequest("http://127.0.0.1:3001/api/projects", {
          method: "POST",
          headers: {
            origin: "http://127.0.0.1:3001",
            cookie: "sajtmaskin_session=local",
          },
        }),
      );

      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("x-middleware-next")).toBe("1");
      expect(denied.status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects a customer sibling even when the browser calls it same-site", async () => {
    const res = await proxy(
      new NextRequest("https://sajtmaskin.se/api/projects", {
        method: "POST",
        headers: {
          origin: "https://customer.sajtmaskin.se",
          "sec-fetch-site": "same-site",
          cookie: "sajtmaskin_session=shadowed",
        },
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "origin_not_allowed" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("does not derive trust from the request Host", async () => {
    const res = await proxy(
      new NextRequest("https://customer.sajtmaskin.se/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "https://customer.sajtmaskin.se",
          cookie: "sajtmaskin_auth=shadowed",
        },
      }),
    );

    expect(res.status).toBe(403);
  });

  it.each(["null", "*", "https://sajtmaskin.se/", "malformed"])(
    "rejects the non-exact Origin value %s",
    async (origin) => {
      const res = await proxy(
        new NextRequest("https://sajtmaskin.se/api/projects", {
          method: "POST",
          headers: { origin },
        }),
      );

      expect(res.status).toBe(403);
    },
  );

  it("accepts a no-Origin cookie mutation only with same-origin browser evidence", async () => {
    const allowed = await proxy(
      new NextRequest("https://sajtmaskin.se/api/projects", {
        method: "POST",
        headers: {
          cookie: "__Host-sajtmaskin_session=signed",
          "sec-fetch-site": "same-origin",
        },
      }),
    );
    const denied = await proxy(
      new NextRequest("https://sajtmaskin.se/api/projects", {
        method: "POST",
        headers: {
          cookie: "sajtmaskin_session=shadowed",
          "sec-fetch-site": "same-site",
        },
      }),
    );

    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(403);
  });

  it("keeps the no-Origin API-key client outside browser CSRF handling", async () => {
    const res = await proxy(
      new NextRequest("https://sajtmaskin.se/api/kostnadsfri", {
        method: "POST",
        headers: { "x-api-key": "owned-by-the-route" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "/api/drains/vercel",
    "/api/stripe/webhook",
    "/api/webhooks/openai",
    "/api/webhooks/v0",
    "/api/webhooks/vercel",
    "/api/kostnadsfri/unsubscribe",
  ])("leaves signed machine receiver %s to its route-owned authentication", async (path) => {
    const res = await proxy(
      new NextRequest(`https://sajtmaskin.se${path}`, {
        method: "POST",
        headers: { origin: "https://untrusted.example" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects an untrusted API preflight and answers an exact trusted one", async () => {
    const denied = await proxy(
      new NextRequest("https://sajtmaskin.se/api/projects", {
        method: "OPTIONS",
        headers: { origin: "https://customer.sajtmaskin.se" },
      }),
    );
    const allowed = await proxy(
      new NextRequest("https://sajtmaskin.se/api/projects", {
        method: "OPTIONS",
        headers: { origin: "https://preview.sajtmaskin.se" },
      }),
    );

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://preview.sajtmaskin.se",
    );
  });

  it("does not block a read but does not reflect an untrusted read Origin", async () => {
    const res = await proxy(
      new NextRequest("https://sajtmaskin.se/api/projects", {
        headers: { origin: "https://customer.sajtmaskin.se" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

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

describe("proxy CSP — Vercel Blob media host", () => {
  it("allows the public Blob store on media-src so the kostnadsfri intro film can play", async () => {
    const mediaSrc = directive(
      await cspFor("https://sajtmaskin.example/kostnadsfri/exempel-ab"),
      "media-src",
    );

    // `blob:` is the URL scheme, not the Blob storage domain. Both are needed:
    // dropping either one blocks the film or the in-page blob: media sources.
    expect(mediaSrc).toContain("https://*.public.blob.vercel-storage.com");
    expect(mediaSrc.split(/\s+/)).toContain("blob:");
  });

  it("keeps the Blob media host once CSP enforcement is switched on", async () => {
    const previous = process.env.CSP_ENFORCE;
    process.env.CSP_ENFORCE = "true";

    try {
      const response = await proxy(
        new NextRequest(new URL("https://sajtmaskin.example/kostnadsfri/exempel-ab")),
      );
      const enforced = response.headers.get("Content-Security-Policy") ?? "";

      expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
      expect(directive(enforced, "media-src")).toContain(
        "https://*.public.blob.vercel-storage.com",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.CSP_ENFORCE;
      } else {
        process.env.CSP_ENFORCE = previous;
      }
    }
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

  it("allows the Google Ads gtag hosts needed by conversion tracking", async () => {
    const csp = await cspFor("https://sajtmaskin.example/");
    const scriptSrc = directive(csp, "script-src");
    const connectSrc = directive(csp, "connect-src");
    const frameSrc = directive(csp, "frame-src");

    expect(scriptSrc).toContain("https://www.googletagmanager.com");
    expect(frameSrc).toContain("https://www.googletagmanager.com");
    expect(connectSrc).toContain("https://www.googleadservices.com");
    expect(connectSrc).toContain("https://googleads.g.doubleclick.net");
    expect(connectSrc).toContain("https://www.google.com");
    expect(scriptSrc).not.toContain("https://*.googleapis.com");
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
