import { NextResponse } from "next/server";

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
      ? "public, max-age=31536000, immutable"
      : "public, max-age=60, stale-while-revalidate=300";

    const headers: Record<string, string> = {
      "content-type": contentType,
      "cache-control": cacheControl,
      "access-control-allow-origin": "*",
    };

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers["content-length"] = contentLength;
    }

    return new NextResponse(upstream.body, { headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return new NextResponse(message, { status: 502 });
  }
}
