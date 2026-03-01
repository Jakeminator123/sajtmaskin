import { NextResponse } from "next/server";

/**
 * Asset proxy for inspector mode. Fetches JS, CSS, images and other
 * sub-resources from vusercontent.net server-side and returns them as
 * same-origin responses. This avoids CORS/CORP issues that occur when
 * a proxied page (served from localhost) tries to load cross-origin assets.
 *
 * Usage: GET /api/proxy-asset?url=https://demo-xxx.vusercontent.net/_next/static/chunk.js
 *
 * For CSS files, root-relative url() references are rewritten to also
 * go through this proxy so fonts/images referenced in CSS load correctly.
 *
 * Only vusercontent.net origins are allowed (security allowlist).
 */

const ALLOWED_HOSTS = [".vusercontent.net"];

function isAllowedOrigin(url: URL): boolean {
  return ALLOWED_HOSTS.some((suffix) => url.hostname.endsWith(suffix));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return new NextResponse("Missing ?url= parameter", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol) || !isAllowedOrigin(target)) {
    return new NextResponse("Forbidden origin", { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "*/*",
      },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";

    const isImmutable =
      target.pathname.startsWith("/_next/static/") ||
      target.pathname.includes(".chunkhash.") ||
      /\.[a-f0-9]{8,}\.\w+$/.test(target.pathname);

    const cacheControl = isImmutable
      ? "public, max-age=86400, stale-while-revalidate=604800"
      : "public, max-age=60, stale-while-revalidate=300";

    const headers: Record<string, string> = {
      "content-type": contentType,
      "cache-control": cacheControl,
      "access-control-allow-origin": "*",
    };

    if (contentType.includes("text/css")) {
      let css = await upstream.text();
      const assetOrigin = target.origin;
      const PROXY = "/api/proxy-asset?url=";
      css = css.replace(
        /url\(\s*(['"]?)(\/(?!\/|api\/proxy-asset)[^)'"]*)\1\s*\)/gi,
        (_m: string, quote: string, path: string) =>
          `url(${quote}${PROXY}${encodeURIComponent(assetOrigin + path)}${quote})`,
      );
      return new NextResponse(css, { headers });
    }

    // Do NOT forward upstream content-length: Node.js fetch auto-decompresses
    // gzip/brotli responses, so the decompressed body is larger than the
    // original content-length header. Omitting it lets chunked transfer work.
    return new NextResponse(upstream.body, { headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return new NextResponse(message, { status: 502 });
  }
}
