import type { NextRequest } from "next/server";

export function hasValidMcpApiKey(req: NextRequest): boolean {
  const key = process.env.MCP_GENERATED_CODE_API_KEY?.trim();
  if (!key) return false;
  const provided = req.headers.get("x-api-key")?.trim();
  return provided === key;
}
