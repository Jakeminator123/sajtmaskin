import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import getSdk from "@/lib/get-user-sdk/middleware";
import { hasWhopProductAccess } from "@/lib/has-product";

const protectedPrefixes = ["/app"];
const requiredProducts = (process.env.NEXT_PUBLIC_REQUIRED_PRODUCT || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export default withAuth(
  async function middleware(req) {
    const pathname = req.nextUrl.pathname;
    const needsProtection = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

    if (!needsProtection) {
      return NextResponse.next();
    }

    const { sdk } = getSdk(req);
    if (!sdk) {
      const signInUrl = new URL("/api/auth/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", req.url);
      return NextResponse.redirect(signInUrl);
    }

    if (!requiredProducts.length) {
      return NextResponse.next();
    }

    const membership = await hasWhopProductAccess(sdk as never, requiredProducts);
    if (membership) {
      return NextResponse.next();
    }

    const upgradeUrl = new URL("/upgrade", req.url);
    upgradeUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(upgradeUrl);
  },
  {
    callbacks: {
      authorized: () => true,
    },
  }
);

export const config = {
  matcher: ["/app/:path*"],
};
