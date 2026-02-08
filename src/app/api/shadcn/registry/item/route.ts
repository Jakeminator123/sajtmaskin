import { NextResponse } from "next/server";
import { getRegistryCache } from "@/lib/shadcn-registry-cache";
import { getRegistryBaseUrl, resolveRegistryStyle } from "@/lib/v0/v0-url-parser";

export const runtime = "nodejs";
export const revalidate = 300;
const LEGACY_STYLE_DEFAULT = "new-york";

function resolveRegistryBaseUrl() {
  const envBase = process.env.REGISTRY_BASE_URL?.trim();
  return envBase || getRegistryBaseUrl();
}

function buildRegistryItemUrl(name: string, style?: string, source: "official" | "legacy" = "official"): string {
  const baseUrl = resolveRegistryBaseUrl();
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

  const baseUrl = resolveRegistryBaseUrl();
  if (!force) {
    const cache = await getRegistryCache({ baseUrl, style, source });
    if (cache?.itemStatus?.[name] === false) {
      return NextResponse.json(
        { error: "Registry item saknas", details: `Item "${name}" hittades inte i registryn.` },
        { status: 404 },
      );
    }
  }

  const url = buildRegistryItemUrl(name, style, source);
  const response = await fetch(
    url,
    force
      ? { headers: buildRegistryHeaders(), cache: "no-store" }
      : { headers: buildRegistryHeaders(), next: { revalidate } },
  ).catch(() => null);

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
