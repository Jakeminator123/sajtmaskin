export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*", "/settings/:path*"],
};
