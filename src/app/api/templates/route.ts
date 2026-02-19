import { NextRequest, NextResponse } from "next/server";
import { normalizeBuildIntent } from "@/lib/builder/build-intent";
import { getTemplateCatalog, type TemplateCatalogSource } from "@/lib/templates/template-catalog";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const intentParam = searchParams.get("intent");
  const sourceParam = searchParams.get("source");

  const intent = intentParam ? normalizeBuildIntent(intentParam) : undefined;
  const source = sourceParam === "v0" ? (sourceParam as TemplateCatalogSource) : undefined;

  const templates = getTemplateCatalog({ intent, source });

  return NextResponse.json({ templates });
}
