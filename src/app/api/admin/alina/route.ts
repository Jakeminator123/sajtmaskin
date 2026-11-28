import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { alinaAvailable, forwardAlina } from "@/lib/avatar/alina-local";

export async function GET(request: NextRequest) {
  if (!alinaAvailable(request)) return NextResponse.json({}, { status: 404 });
  const admin = await requireAdminAccess(request);
  return admin.ok ? forwardAlina(request, "/api/admin/alina") : admin.response;
}

export async function POST(request: NextRequest) {
  if (!alinaAvailable(request)) return NextResponse.json({}, { status: 404 });
  const admin = await requireAdminAccess(request);
  if (!admin.ok) return admin.response;
  const raw = await request.text();
  if (raw.length > 6000) return NextResponse.json({}, { status: 413 });
  try {
    return await forwardAlina(request, "/api/admin/alina", JSON.parse(raw));
  } catch {
    return NextResponse.json({}, { status: 400 });
  }
}
