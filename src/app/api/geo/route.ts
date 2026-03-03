import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const city = req.headers.get("x-vercel-ip-city") || null;
  const lat = parseFloat(req.headers.get("x-vercel-ip-latitude") || "");
  const lng = parseFloat(req.headers.get("x-vercel-ip-longitude") || "");
  const country = req.headers.get("x-vercel-ip-country") || null;

  return NextResponse.json({
    city: city ? decodeURIComponent(city) : null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    country,
  });
}
