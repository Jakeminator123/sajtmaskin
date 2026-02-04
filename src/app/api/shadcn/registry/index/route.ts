import { NextResponse } from "next/server";
import { getRegistryBaseUrl, getRegistryStyle } from "@/lib/v0/v0-url-parser";

export const runtime = "nodejs";
export const revalidate = 300;

function resolveRegistryBaseUrl() {
  const envBase = process.env.REGISTRY_BASE_URL?.trim();
  return envBase || getRegistryBaseUrl();
}

function buildRegistryIndexUrl(style?: string): string {
  const baseUrl = resolveRegistryBaseUrl();
  const resolvedStyle = style?.trim() || getRegistryStyle();
  return `${baseUrl}/r/styles/${encodeURIComponent(resolvedStyle)}/registry.json`;
}

function buildRegistryHeaders(): Record<string, string> {
  const token = process.env.REGISTRY_AUTH_TOKEN?.trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const style = searchParams.get("style")?.trim() || getRegistryStyle();
  const url = buildRegistryIndexUrl(style);

  const response = await fetch(url, {
    headers: buildRegistryHeaders(),
    next: { revalidate },
  }).catch(() => null);

  if (!response) {
    return NextResponse.json({ error: "Registry request failed" }, { status: 502 });
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return NextResponse.json(
      { error: "Registry request failed", status: response.status, details: errorText || null },
      { status: response.status },
    );
  }

  const data = await response.json().catch(() => null);
  if (!data) {
    return NextResponse.json({ error: "Invalid registry response" }, { status: 502 });
  }

  return NextResponse.json(data);
}
