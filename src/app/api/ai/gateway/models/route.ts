import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GatewayModel = {
  id?: string;
};

type GatewayModelsResponse = {
  data?: GatewayModel[];
};

function normalizeModelId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function GET() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing AI_GATEWAY_API_KEY",
        setup: "Set AI_GATEWAY_API_KEY to list AI Gateway models.",
      },
      { status: 401 },
    );
  }

  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `AI Gateway models fetch failed (HTTP ${res.status})`,
          details: text || null,
        },
        { status: res.status },
      );
    }

    const payload = (await res.json().catch(() => null)) as GatewayModelsResponse | null;
    const raw = Array.isArray(payload?.data) ? (payload?.data ?? []) : [];
    const ids = raw
      .map((item) => normalizeModelId(item?.id))
      .filter((id): id is string => Boolean(id));

    const models = Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to reach AI Gateway",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
