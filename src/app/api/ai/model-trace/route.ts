import { NextResponse } from "next/server";
import { buildModelTraceSnapshot } from "@/lib/models/trace";

export const runtime = "nodejs";

function readBooleanParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const snapshot = buildModelTraceSnapshot({
    selectedModelTier: searchParams.get("modelTier"),
    promptAssistModel: searchParams.get("promptAssistModel"),
    promptAssistDeep: readBooleanParam(searchParams.get("promptAssistDeep")),
    thinking: readBooleanParam(searchParams.get("thinking")),
    canUseDeepBrief: readBooleanParam(searchParams.get("canUseDeepBrief")),
  });

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
