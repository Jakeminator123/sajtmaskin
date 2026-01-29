import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateDeploymentStatus } from "@/lib/deployment";

export const runtime = "nodejs";

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function computeSignature(rawBody: string, secret: string): string {
  return crypto.createHmac("sha1", secret).update(rawBody, "utf8").digest("hex");
}

function mapWebhookTypeToStatus(
  type: string,
): "pending" | "building" | "ready" | "error" | "cancelled" | null {
  switch (type) {
    case "deployment.created":
    case "deployment.check-ran":
    case "deployment.checks-ran":
    case "deployment.checks.succeeded":
    case "deployment.checks.failed":
    case "deployment.promoted":
      return type === "deployment.promoted" ? "ready" : "building";
    case "deployment.succeeded":
      return "ready";
    case "deployment.error":
      return "error";
    case "deployment.canceled":
    case "deployment.cancelled":
      return "cancelled";
    default:
      return null;
  }
}

function extractDeploymentId(body: any): string | null {
  const id =
    body?.payload?.deployment?.id ||
    body?.payload?.deploymentId ||
    body?.payload?.id ||
    body?.deployment?.id ||
    body?.deploymentId ||
    body?.id;

  return typeof id === "string" && id.length > 0 ? id : null;
}

function extractUrl(body: any): string | null {
  const url =
    body?.payload?.deployment?.url || body?.payload?.url || body?.deployment?.url || body?.url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function extractInspectorUrl(body: any): string | null {
  const url = body?.payload?.links?.deployment || body?.links?.deployment;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function extractProjectId(body: any): string | null {
  const id =
    body?.payload?.project?.id || body?.payload?.projectId || body?.project?.id || body?.projectId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function POST(req: Request) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing VERCEL_WEBHOOK_SECRET" }, { status: 500 });
  }

  const signature = req.headers.get("x-vercel-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing x-vercel-signature" }, { status: 401 });
  }

  const rawBody = await req.text();
  const expected = computeSignature(rawBody, secret);

  if (!timingSafeEqualHex(signature, expected)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: any = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const type = typeof body?.type === "string" ? body.type : null;
  if (!type) {
    return NextResponse.json({ ok: true, ignored: true, reason: "missing type" });
  }

  const deploymentId = extractDeploymentId(body);
  if (!deploymentId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "missing deployment id" });
  }

  const status = mapWebhookTypeToStatus(type);
  if (!status) {
    return NextResponse.json({ ok: true, ignored: true, reason: "unhandled event type", type });
  }

  const match = await db
    .select()
    .from(deployments)
    .where(eq(deployments.vercelDeploymentId, deploymentId))
    .limit(1);

  if (match.length === 0) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no matching deployment" });
  }

  const url = extractUrl(body);
  const inspectorUrl = extractInspectorUrl(body);
  const projectId = extractProjectId(body);

  await updateDeploymentStatus(match[0].id, status, {
    ...(url ? { url } : {}),
    ...(inspectorUrl ? { inspectorUrl } : {}),
    ...(projectId ? { vercelProjectId: projectId } : {}),
  });

  return NextResponse.json({ ok: true });
}
