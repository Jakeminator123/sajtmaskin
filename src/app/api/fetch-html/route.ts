import { NextResponse } from "next/server";

/**
 * Server-side fetch of external HTML pages.
 * This bypasses CORS by proxying the request, then sanitizes
 * dangerous content so the HTML can be safely displayed in an iframe with srcDoc.
 */

function stripDangerous(html: string): string {
  let out = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove inline event handlers (onclick, onload, etc.)
  out = out.replace(/\son\w+="[^"\n\r]*"/gi, "");
  out = out.replace(/\son\w+='[^'\n\r]*'/gi, "");

  // Remove CSP meta tags that could interfere with srcDoc rendering
  out = removeCspMeta(out);

  return out;
}

function removeCspMeta(html: string): string {
  return html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");
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
  // Rewrite href/src that are relative (no scheme, no //, no leading /, no #, no data:, blob:, mailto:, tel:)
  // Example: href="styles.css" -> href="https://host/path/styles.css"
  return html.replace(
    /\b(href|src)=("|')(?![a-z]+:|\/\/|\/|#)([^"']+)\2/gi,
    (_match, attr, quote, path) => `${attr}=${quote}${baseHref}${path}${quote}`,
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const allowScriptsParam = searchParams.get("allowScripts");
  const allowScripts = allowScriptsParam === "1" || allowScriptsParam === "true";

  if (!url) {
    return NextResponse.json({ error: "Missing ?url= parameter" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  // Only allow http/https protocols
  if (!["http:", "https:"].includes(target.protocol)) {
    return NextResponse.json({ error: "Only http/https URLs allowed" }, { status: 400 });
  }

  try {
    const res = await fetch(target.toString(), {
      redirect: "follow",
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

    let html = await res.text();

    if (allowScripts) {
      // Keep scripts so hydration can run, but drop CSP that could block our injector
      html = removeCspMeta(html);
    } else {
      html = stripDangerous(html);
    }

    // Build base href to the "directory" of the target URL so relative resources work.
    const baseHref = target.origin + target.pathname.replace(/\/[^/]*$/, "/");
    // Fix root-relative assets (e.g., /_next/static/...) so they resolve correctly from srcdoc.
    html = rewriteRootRelativeUrls(html, target.origin);
    // Fix relative assets without leading slash (e.g., app.css, a123.css)
    html = rewriteRelativeUrls(html, baseHref);
    html = injectBaseHref(html, baseHref);

    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
