import { NextResponse } from "next/server";
import { resolveCanonicalLivePreviewUrl } from "@/lib/api/preview-url-contract";
import type {
  PreviewSessionPostApiJson,
  PreviewStatusApiJson,
} from "@/lib/gen/preview/preview-contract";
import { isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";

export const dynamic = "force-dynamic";

type PreviewHostStatus = "ready" | "pending" | "booting";

type PreviewResponseBody = {
  url: string;
  status: PreviewHostStatus | "ready";
  kind: "preview-host" | "shim";
};

type PreviewRequestPayload = {
  runId?: unknown;
  versionId?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readPayload(req: Request): Promise<PreviewRequestPayload | null> {
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as PreviewRequestPayload;
  } catch {
    return null;
  }
}

function resolveRequestedVersionId(req: Request, payload: PreviewRequestPayload | null): string | null {
  const { searchParams } = new URL(req.url);
  return (
    readString(searchParams.get("versionId")) ??
    readString(searchParams.get("runId")) ??
    readString(payload?.versionId) ??
    readString(payload?.runId)
  );
}

function shimUrl(siteId: string, versionId: string | null): string {
  const q = new URLSearchParams({ chatId: siteId });
  if (versionId) q.set("versionId", versionId);
  return `/api/preview-render?${q.toString()}`;
}

function shimResponse(siteId: string, versionId: string | null): NextResponse<PreviewResponseBody> {
  return NextResponse.json({
    url: shimUrl(siteId, versionId),
    status: "ready",
    kind: "shim",
  });
}

function forwardedHeaders(req: Request, includeJson = false): Headers {
  const headers = new Headers();
  if (includeJson) headers.set("Content-Type", "application/json");
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const sessionId = req.headers.get("x-session-id");
  if (sessionId) headers.set("x-session-id", sessionId);
  return headers;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function previewHostResponse(
  url: string,
  status: PreviewHostStatus,
): NextResponse<PreviewResponseBody> {
  return NextResponse.json({
    url,
    status,
    kind: "preview-host",
  });
}

async function pollPreviewStatus(params: {
  req: Request;
  siteId: string;
  versionId: string;
  previewSessionId: string | null;
}): Promise<PreviewStatusApiJson | null> {
  const { req, siteId, versionId, previewSessionId } = params;
  const q = new URLSearchParams({ versionId });
  if (previewSessionId) q.set("previewSessionId", previewSessionId);
  const statusUrl = new URL(
    `/api/engine/chats/${encodeURIComponent(siteId)}/preview-status?${q.toString()}`,
    req.url,
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(statusUrl, {
      method: "GET",
      headers: forwardedHeaders(req),
      cache: "no-store",
    }).catch(() => null);

    if (!response) return null;
    const data = (await response.json().catch(() => null)) as PreviewStatusApiJson | null;
    if (!response.ok || !data || data.ok !== true) return null;

    if (data.status === "starting" && attempt === 0) {
      await delay(350);
      continue;
    }

    return data;
  }

  return null;
}

async function handlePreview(
  req: Request,
  ctx: { params: Promise<{ siteId: string }> },
  options: { includeBody: boolean },
): Promise<NextResponse<PreviewResponseBody | { error: string }>> {
  const { siteId } = await ctx.params;
  if (!siteId) {
    return NextResponse.json({ error: "siteId krävs." }, { status: 400 });
  }

  const payload = options.includeBody ? await readPayload(req) : null;
  const versionId = resolveRequestedVersionId(req, payload);

  if (!isTier2PreviewConfigured()) {
    return shimResponse(siteId, versionId);
  }

  const startUrl = new URL(
    `/api/engine/chats/${encodeURIComponent(siteId)}/preview-session`,
    req.url,
  );

  const startResponse = await fetch(startUrl, {
    method: "POST",
    headers: forwardedHeaders(req, true),
    body: JSON.stringify(versionId ? { versionId } : {}),
    cache: "no-store",
  }).catch(() => null);

  if (!startResponse) {
    return shimResponse(siteId, versionId);
  }

  const startData = (await startResponse.json().catch(() => null)) as PreviewSessionPostApiJson | null;
  if (!startResponse.ok || !startData?.ok) {
    return shimResponse(siteId, versionId);
  }

  const startUrlCandidate = resolveCanonicalLivePreviewUrl(startData.previewUrl ?? null);
  const previewSessionId = readString(startData.previewSessionId);

  if (!versionId) {
    if (startUrlCandidate) {
      return previewHostResponse(startUrlCandidate, "ready");
    }
    return shimResponse(siteId, versionId);
  }

  const statusData = await pollPreviewStatus({
    req,
    siteId,
    versionId,
    previewSessionId,
  });
  const statusUrlCandidate = resolveCanonicalLivePreviewUrl(statusData?.previewUrl ?? null);
  const resolvedUrl = statusUrlCandidate ?? startUrlCandidate;

  if (!statusData) {
    if (!resolvedUrl) return shimResponse(siteId, versionId);
    return previewHostResponse(resolvedUrl, "pending");
  }

  if (statusData.status === "running") {
    if (!resolvedUrl) return shimResponse(siteId, versionId);
    return previewHostResponse(resolvedUrl, "ready");
  }

  if (statusData.status === "starting") {
    if (!resolvedUrl) return shimResponse(siteId, versionId);
    return previewHostResponse(resolvedUrl, "booting");
  }

  if (statusData.status === "version_mismatch") {
    if (!resolvedUrl) return shimResponse(siteId, versionId);
    return previewHostResponse(resolvedUrl, "pending");
  }

  if (statusData.status === "missing" || statusData.status === "stopped") {
    if (resolvedUrl) return previewHostResponse(resolvedUrl, "pending");
    return shimResponse(siteId, versionId);
  }

  return shimResponse(siteId, versionId);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ siteId: string }> },
) {
  return handlePreview(req, ctx, { includeBody: true });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ siteId: string }> },
) {
  return handlePreview(req, ctx, { includeBody: false });
}
