import { NextRequest, NextResponse } from "next/server";

const allowedMethods = (process.env.ALLOWED_METHODS || "GET,OPTIONS").split(",");
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "").split(",").filter(Boolean);
const allowedHeaders = (process.env.ALLOWED_HEADERS || "Content-Type,Authorization").split(",");
const exposedHeaders = (process.env.EXPOSED_HEADERS || "").split(",").filter(Boolean);
const maxAge = process.env.PREFLIGHT_MAX_AGE
  ? Number.parseInt(process.env.PREFLIGHT_MAX_AGE, 10)
  : undefined;
const credentials = process.env.CREDENTIALS === "true";

function applyCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get("origin") || "";
  const allowAnyOrigin = allowedOrigins.includes("*");
  const isAllowedOrigin = allowAnyOrigin || allowedOrigins.includes(origin);

  if (isAllowedOrigin) {
    response.headers.set(
      "Access-Control-Allow-Origin",
      allowAnyOrigin ? "*" : origin
    );
  }

  response.headers.set("Access-Control-Allow-Credentials", String(credentials));
  response.headers.set("Access-Control-Allow-Methods", allowedMethods.join(","));
  response.headers.set("Access-Control-Allow-Headers", allowedHeaders.join(","));

  if (exposedHeaders.length > 0) {
    response.headers.set("Access-Control-Expose-Headers", exposedHeaders.join(","));
  }

  if (typeof maxAge === "number" && !Number.isNaN(maxAge)) {
    response.headers.set("Access-Control-Max-Age", String(maxAge));
  }

  return response;
}

export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return applyCors(request, new NextResponse(null, { status: 204 }));
  }

  return applyCors(request, NextResponse.next());
}

export const config = {
  matcher: "/api/authenticate",
};
