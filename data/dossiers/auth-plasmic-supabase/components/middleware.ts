import { getMiddlewareResponse } from "@plasmicapp/loader-nextjs/edge";
import { NextRequest, NextResponse, userAgent } from "next/server";

export const config = {
  matcher: ["/:path((?!_next/|api/|favicon\\.ico|plasmic-host).*)"],
};

export async function middleware(req: NextRequest) {
  if (req.method !== "GET") {
    return;
  }

  const ua = userAgent(req);
  const browser = ua.browser.name?.includes("Chrome")
    ? "Chrome"
    : ua.browser.name?.includes("Safari")
    ? "Safari"
    : "Other";

  const newUrl = req.nextUrl.clone();
  const plasmicSeed = req.cookies.get("plasmic_seed");

  const { pathname, cookies } = getMiddlewareResponse({
    path: newUrl.pathname,
    traits: {
      ...(req.nextUrl.searchParams.get("utm_source")
        ? { utm_source: req.nextUrl.searchParams.get("utm_source") ?? "" }
        : {}),
      browser,
    },
    cookies: {
      ...(plasmicSeed ? { plasmic_seed: plasmicSeed.value } : {}),
    },
  });

  newUrl.pathname = pathname;
  const res = NextResponse.rewrite(newUrl);

  cookies.forEach((cookie) => {
    res.cookies.set(cookie.key, cookie.value);
  });

  return res;
}
