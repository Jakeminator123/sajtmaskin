import { NextResponse } from "next/server";
import { validateSsrfTarget, safeFetch } from "@/lib/ssrf-guard";
import { withRateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";

/**
 * Server-side fetch of external HTML pages.
 *
 * The payload is always returned as inert text, never as renderable HTML from
 * the Sajtmaskin origin. Callers that turn the text into `srcDoc` must still
 * use an iframe sandbox without `allow-same-origin`.
 *
 * Security: Private/internal IPs are blocked. Redirects are validated.
 */

const INERT_HTML_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "sandbox",
].join("; ");

function stripVoid(html: string, tag: string): string {
  return html.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), "");
}

function stripElement(html: string, tag: string): string {
  const closed = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  return stripVoid(html.replace(closed, ""), tag);
}

/**
 * HTML5 after a tag name: tab/LF/FF/space enter before-attribute-name;
 * `/` enters self-closing start tag and the next non-`>` becomes an attribute
 * (`<img/onerror=...>`). Quoted values are masked so `/onclick` in a URL path
 * is not treated as a handler.
 */
function stripInlineEventHandlers(html: string): string {
  return html.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
    const held: string[] = [];
    const masked = tag.replace(/"[^"]*"|'[^']*'/g, (quoted) => {
      held.push(quoted);
      return `\u0000${held.length - 1}\u0000`;
    });
    const stripped = masked.replace(
      /(?:[\s/])on\w+(?:\s*=\s*(?:\u0000\d+\u0000|[^\s>"'/]+))?/gi,
      (match) => (match.startsWith("/") ? "/" : ""),
    );
    return stripped.replace(/\u0000(\d+)\u0000/g, (_, idx) => held[Number(idx)] ?? "");
  });
}

function stripDangerous(html: string): string {
  let out = html;

  // Drop executable / embedding surfaces before any URL rewrite or <base> inject.
  // Script may lack a closer; treat the remainder of the document as tainted.
  out = out.replace(/<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/gi, "");
  out = stripVoid(out, "script");
  out = stripElement(out, "iframe");
  out = stripElement(out, "object");
  out = stripVoid(out, "embed");
  out = stripVoid(out, "base");

  out = stripInlineEventHandlers(out);

  // Neutralize javascript: URLs. `\b` treats `/` as a boundary, so
  // `<a/href=javascript:...>` is covered the same as whitespace.
  out = out.replace(
    /(\b(?:href|src|action|formaction)\s*=\s*)(["'])\s*javascript\s*:[\s\S]*?\2/gi,
    "$1$2#$2",
  );
  out = out.replace(
    /(\b(?:href|src|action|formaction)\s*=\s*)javascript\s*:[^\s>]*/gi,
    '$1"#"',
  );

  // Remove CSP meta tags that could interfere with sandboxed srcDoc rendering.
  out = removeCspMeta(out);

  return out;
}

function removeCspMeta(html: string): string {
  return html.replace(
    /<meta\b[^>]*http-equiv\s*=\s*["']?Content-Security-Policy\b["']?[^>]*>/gi,
    "",
  );
}

function injectBaseHref(html: string, baseHref: string): string {
  const baseTag = `<base href="${baseHref}" target="_blank">`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`);
  }

  // If page lacks <head>, create a minimal wrapper
  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

function rewriteRootRelativeUrls(html: string, origin: string): string {
  // Rewrite href/src that start with a single leading slash to absolute URLs.
  // Keeps protocol-relative (//) and absolute URLs untouched.
  return html.replace(
    /\b(href|src)=("|')\/(?!\/)([^"']*)\2/gi,
    (_match, attr, quote, path) => `${attr}=${quote}${origin}/${path}${quote}`,
  );
}

function rewriteRelativeUrls(html: string, baseHref: string): string {
  // Rewrite href/src that are relative (no scheme, no //, no leading /, no #, data:, blob:, mailto:, tel:).
  // Example: href="styles.css" -> href="https://host/path/styles.css"
  return html.replace(
    /\b(href|src)=("|')(?![a-z]+:|\/\/|\/|#)([^"']+)\2/gi,
    (_match, attr, quote, path) => `${attr}=${quote}${baseHref}${path}${quote}`,
  );
}

export async function GET(req: Request) {
  return withRateLimit(req, "fetch:html", async () => {
    const user = await getCurrentUser(req);
    const sessionId = getSessionIdFromRequest(req);
    if (!user && !sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const allowScriptsParam = searchParams.get("allowScripts");
    const allowScripts = allowScriptsParam === "1" || allowScriptsParam === "true";

    if (!url) {
      return NextResponse.json({ error: "Missing ?url= parameter" }, { status: 400 });
    }

    // Active third-party HTML must never be transported from the app origin.
    // Hydrated inspection belongs on the isolated preview host instead.
    if (allowScripts) {
      return NextResponse.json(
        {
          error:
            "allowScripts is no longer supported on the app origin; use an isolated preview host",
        },
        { status: 400 },
      );
    }

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const ssrfCheck = validateSsrfTarget(target);
    if (!ssrfCheck.ok) {
      return NextResponse.json({ error: ssrfCheck.reason }, { status: 403 });
    }

    try {
      const res = await safeFetch(target.toString(), {
        timeoutMs: 15_000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!res.ok) {
        return NextResponse.json({ error: `Failed to fetch: HTTP ${res.status}` }, { status: 502 });
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        return NextResponse.json(
          { error: `Not an HTML page (content-type: ${contentType})` },
          { status: 400 },
        );
      }

      let html = stripDangerous(await res.text());

      // Build base href to the "directory" of the target URL so relative resources work.
      const baseHref = target.origin + target.pathname.replace(/\/[^/]*$/, "/");
      // Fix root-relative assets (e.g., /_next/static/...) so they resolve correctly from srcdoc.
      html = rewriteRootRelativeUrls(html, target.origin);
      // Fix relative assets without leading slash (e.g., app.css, a123.css)
      html = rewriteRelativeUrls(html, baseHref);
      html = injectBaseHref(html, baseHref);

      return new NextResponse(html, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": INERT_HTML_CSP,
          "x-content-type-options": "nosniff",
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown fetch error";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  });
}
