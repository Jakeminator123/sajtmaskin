import { NextResponse } from "next/server";
import {
  getRegistryBaseUrl,
  LEGACY_STYLE_DEFAULT,
  resolveRegistryStyle,
} from "@/lib/shadcn/registry-url";

export const runtime = "nodejs";
export const revalidate = 300;

function buildRegistryItemUrl(name: string, style?: string, source: "official" | "legacy" = "official"): string {
  const baseUrl = getRegistryBaseUrl();
  const resolvedStyle =
    source === "legacy"
      ? (style?.trim() || LEGACY_STYLE_DEFAULT)
      : resolveRegistryStyle(style, baseUrl);
  return `${baseUrl}/r/styles/${encodeURIComponent(resolvedStyle)}/${encodeURIComponent(
    name,
  )}.json`;
}

function buildRegistryHeaders(): Record<string, string> {
  const token = process.env.REGISTRY_AUTH_TOKEN?.trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.trim();
  const style = searchParams.get("style")?.trim() || undefined;
  const force = searchParams.get("force") === "1";
  const source = (searchParams.get("source")?.trim() || "official") as
    | "official"
    | "legacy";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const url = buildRegistryItemUrl(name, style, source);
  let response: Response;
  try {
    response = await fetch(
      url,
      force
        ? { headers: buildRegistryHeaders(), cache: "no-store" }
        : { headers: buildRegistryHeaders(), next: { revalidate } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return NextResponse.json(
      { error: `Registry fetch failed: ${msg}`, url },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return NextResponse.json(
      { error: "Registry request failed", status: response.status, details: errorText || null },
      { status: response.status },
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return NextResponse.json(
      { error: "Registry returned non-JSON response" },
      { status: 502 },
    );
  }

  return NextResponse.json(data);
}
