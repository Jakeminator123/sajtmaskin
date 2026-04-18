export { auth as middleware } from "@/components/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*"],
};
