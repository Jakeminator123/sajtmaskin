import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidMcpApiKey } from "@/lib/mcp/auth";
import { generateSiteFromPrompt } from "@/lib/mcp/generate-site";

export const runtime = "nodejs";
export const maxDuration = 800;

const generateSiteSchema = z.object({
  prompt: z.string().min(1),
  buildIntent: z.enum(["template", "website", "app"]).optional().default("website"),
  modelId: z.string().optional(),
  thinking: z.boolean().optional().default(true),
  imageGenerations: z.boolean().optional().default(true),
  scaffoldMode: z.enum(["auto", "manual", "off"]).optional().default("auto"),
  scaffoldId: z.string().optional(),
  runtimeMode: z.enum(["preview", "sandbox"]).optional().default("preview"),
  sandbox: z
    .object({
      runtime: z.enum(["node24", "node22", "python3.13"]).optional(),
      vcpus: z.number().min(1).max(8).optional(),
      timeoutMs: z.number().min(30_000).max(15 * 60_000).optional(),
      installCommand: z.string().optional(),
      startCommand: z.string().optional(),
      ports: z.array(z.number()).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  if (!hasValidMcpApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = generateSiteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await generateSiteFromPrompt(parsed.data);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Generation failed",
      },
      { status: 500 },
    );
  }
}
