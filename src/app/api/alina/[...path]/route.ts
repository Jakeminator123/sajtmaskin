import { NextRequest, NextResponse } from "next/server";
import { alinaAvailable, alinaUser, forwardAlina } from "@/lib/avatar/alina-local";
import { requireAdminAccess } from "@/lib/auth/admin";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const route = (await context.params).path.join("/");
  if (route === "config" || route === "runtime")
    return forwardAlina(request, "/api/alina/" + route);
  if (!alinaAvailable(request) || !/^(jobs|media)\/[a-f0-9]{32}$/.test(route))
    return NextResponse.json({}, { status: 404 });
  const { owner } = await alinaUser(request);
  const wait = route.startsWith("jobs/") && request.nextUrl.searchParams.get("wait") === "1";
  return forwardAlina(request, "/api/alina/" + route + (wait ? "?wait=1" : ""), undefined, owner);
}

export async function POST(request: NextRequest, context: Context) {
  const route = (await context.params).path.join("/");
  if (!alinaAvailable(request) || !["speech", "audition", "activity", "diagnostics"].includes(route))
    return NextResponse.json({}, { status: 404 });
  const raw = await request.text();
  if (raw.length > 6000) return NextResponse.json({ error: "För lång replik." }, { status: 413 });
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({}, { status: 400 });
  }
  if (route === "diagnostics") {
    if (!["accounts", "openai"].includes(input?.check))
      return NextResponse.json({}, { status: 400 });
    return forwardAlina(request, "/api/alina/diagnostics", { check: input.check });
  }
  if (route === "activity") {
    const idleForMs = input?.idleForMs ?? 0;
    if (!Number.isInteger(idleForMs) || idleForMs < 0 || idleForMs > 15000)
      return NextResponse.json({}, { status: 400 });
    if (input?.method !== undefined && !["visemes", "musetalk"].includes(input.method))
      return NextResponse.json({}, { status: 400 });
    return forwardAlina(request, "/api/alina/activity", { idleForMs,
      ...(input?.method ? { method: input.method } : {}) });
  }
  if (!input || !["welcome", "reply"].includes(input.kind))
    return NextResponse.json({}, { status: 400 });
  if (input.method !== undefined && !["visemes", "musetalk"].includes(input.method))
    return NextResponse.json({}, { status: 400 });
  const voicePreview = input.voice !== undefined || input.tempo !== undefined;
  if (voicePreview && (!["sanna", "eva", "vera"].includes(input.voice) ||
    typeof input.tempo !== "number" || input.tempo < 0.7 || input.tempo > 1.25))
    return NextResponse.json({}, { status: 400 });
  const { owner, name } = await alinaUser(request);
  let displayName = name;
  if (input.kind === "welcome" && typeof input.testName === "string" && input.testName.trim()) {
    const admin = await requireAdminAccess(request);
    if (!admin.ok) return admin.response;
    displayName = input.testName.trim().slice(0, 45);
  }
  const body =
    input.kind === "welcome"
      ? { kind: "welcome", name: displayName }
      : { kind: "reply", text: input.text };
  return forwardAlina(request, "/api/alina/" + route, {
    ...body, ...(input.method ? { method: input.method } : {}),
    ...(voicePreview ? { voice: input.voice, tempo: input.tempo } : {}),
  }, owner);
}
