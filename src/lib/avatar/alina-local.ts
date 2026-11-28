import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { requireAdminAccess } from "@/lib/auth/admin";
import { hostedAlina } from "./alina-hosted";

export function isLocalAlinaRequest(request: NextRequest) {
  return (
    process.env.NODE_ENV === "development" &&
    /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(
      request.headers.get("host") ?? request.nextUrl.host,
    )
  );
}

export function alinaAvailable(request: NextRequest) {
  return isLocalAlinaRequest(request) || Boolean(hostedAlina());
}

export async function forwardAlina(
  request: NextRequest,
  route: string,
  body?: object,
  owner?: string,
) {
  const remote = hostedAlina();
  if (!remote && !isLocalAlinaRequest(request))
    return NextResponse.json({ error: "Alinas studio är avstängd." }, { status: 404 });
  const origin =
    request.nextUrl.protocol + "//" + (request.headers.get("host") ?? request.nextUrl.host);
  if (request.method === "POST" && request.headers.get("origin") !== origin) {
    return NextResponse.json({ error: "Begäran måste komma från samma sajt." }, { status: 403 });
  }
  if (remote) {
    const access = await requireAdminAccess(request);
    if (!access.ok) return access.response;
    owner = "account-" + access.user.id;
  }
  try {
    const secret = remote?.token ?? await readFile(
      path.join(/* turbopackIgnore: true */ process.cwd(), ".cache/alina-local/bridge-token"),
      "utf8",
    );
    const headers = new Headers({
      "X-Alina-Bridge": secret.trim(),
      "Content-Type": "application/json",
    });
    if (owner) headers.set("X-Alina-Owner", owner);
    const range = request.headers.get("range");
    if (route.startsWith("/api/alina/media/") && range) headers.set("Range", range);
    const cookie = request.cookies.get("alina_visit")?.value;
    if (!remote && cookie && /^[0-9a-f]{48}$/.test(cookie)) headers.set("Cookie", "alina_visit=" + cookie);
    const response = await fetch((remote?.origin ?? "http://127.0.0.1:5814") + route, {
      method: request.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(/^\/api\/alina\/jobs\/[a-f0-9]{32}\?wait=1$/.test(route) ? 25000 : route === "/api/alina/diagnostics" ? 18000 : 12000),
    });
    if (remote && response.status >= 500 && !response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      return NextResponse.json({ error: "Talservern kunde inte leverera studions svar. Kontrollera poddens drift hos RunPod." }, { status: 503 });
    }
    const out = new Headers({ "Cache-Control": "private, no-store" });
    for (const key of [
      "content-type",
      "set-cookie",
      "content-length",
      "accept-ranges",
      "content-range",
    ]) {
      const value = response.headers.get(key);
      if (value && !(remote && key === "set-cookie")) out.set(key, value);
    }
    return new Response(response.body, { status: response.status, headers: out });
  } catch {
    return NextResponse.json({ error: remote ? "Alinas talserver kunde inte nås. Kontrollera RunPod. Betalstatus är okänd." :
      "Alinas lokala studio är avstängd. Starta npm run alina:studio." }, { status: 503 });
  }
}

export async function alinaUser(request: NextRequest) {
  const user = await getCurrentUser(request);
  return { owner: user ? "account-" + user.id : undefined, name: user?.name || "" };
}
