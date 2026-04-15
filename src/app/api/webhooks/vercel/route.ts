import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateDeploymentStatus } from "@/lib/deployment";
import { createRedisPublisher, deployStatusChannel } from "@/lib/redis-pubsub";

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
    case "deployment.checkrun.cancel":
    case "deployment.canceled":
    case "deployment.cancelled":
      return "cancelled";
    default:
      return null;
  }
}

type VercelWebhookJson = {
  payload?: {
    deployment?: { id?: unknown; url?: unknown };
    deploymentId?: unknown;
    id?: unknown;
    url?: unknown;
    project?: { id?: unknown };
    projectId?: unknown;
    links?: { deployment?: unknown };
  };
  deployment?: { id?: unknown; url?: unknown };
  deploymentId?: unknown;
  id?: unknown;
  url?: unknown;
  project?: { id?: unknown };
  projectId?: unknown;
  links?: { deployment?: unknown };
};

function extractDeploymentId(body: unknown): string | null {
  const b = body as VercelWebhookJson | null | undefined;
  const id =
    b?.payload?.deployment?.id ||
    b?.payload?.deploymentId ||
    b?.payload?.id ||
    b?.deployment?.id ||
    b?.deploymentId ||
    b?.id;

  return typeof id === "string" && id.length > 0 ? id : null;
}

function extractUrl(body: unknown): string | null {
  const b = body as VercelWebhookJson | null | undefined;
  const url =
    b?.payload?.deployment?.url || b?.payload?.url || b?.deployment?.url || b?.url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function extractInspectorUrl(body: unknown): string | null {
  const b = body as VercelWebhookJson | null | undefined;
  const url = b?.payload?.links?.deployment || b?.links?.deployment;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function extractProjectId(body: unknown): string | null {
  const b = body as VercelWebhookJson | null | undefined;
  const id =
    b?.payload?.project?.id || b?.payload?.projectId || b?.project?.id || b?.projectId;
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

  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const type =
    body && typeof body === "object" && body !== null && "type" in body
      ? typeof (body as { type?: unknown }).type === "string"
        ? (body as { type: string }).type
        : null
      : null;
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

  const projectId = extractProjectId(body);
  const configuredProjectId = process.env.VERCEL_PROJECT_ID?.trim() || null;
  if (configuredProjectId && projectId && projectId !== configuredProjectId) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "project mismatch",
      projectId,
    });
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

  await updateDeploymentStatus(match[0].id, status, {
    ...(url ? { url } : {}),
    ...(inspectorUrl ? { inspectorUrl } : {}),
    ...(projectId ? { vercelProjectId: projectId } : {}),
  });

  let pub: ReturnType<typeof createRedisPublisher> = null;
  try {
    pub = createRedisPublisher();
    if (pub) {
      await pub.publish(
        deployStatusChannel(deploymentId),
        JSON.stringify({ status, url, inspectorUrl, projectId }),
      );
    }
  } catch (pubErr) {
    console.warn("[webhook] Redis publish failed (non-fatal):", pubErr);
  } finally {
    pub?.disconnect();
  }

  return NextResponse.json({ ok: true });
}
