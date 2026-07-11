import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getVercelDeployment, mapVercelReadyStateToStatus } from "@/lib/vercelDeploy";
import {
  resolveDeploymentLiveUrlForChat,
  updateDeploymentStatus,
} from "@/lib/deployment";
import { logDeployError } from "@/lib/deploy/deploy-error-log";
import { getChatByIdForRequest, getEngineChatByIdForRequest } from "@/lib/tenant";
import { withRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ deploymentId: string }> }) {
  return withRateLimit(req, "v0:deployments-single", async () => {
    try {
      const { deploymentId } = await ctx.params;

      const result = await db
        .select()
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
        .limit(1);

      if (result.length === 0) {
        return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
      }

      const deployment = result[0];

      // Engine-first auth med legacy v0-fallback (A#3): deployment-rader ägs
      // primärt av engine-chattar; en v0-only lookup 404:ade own-engine-anrop.
      const chat =
        (await getEngineChatByIdForRequest(req, deployment.chatId)) ??
        (await getChatByIdForRequest(req, deployment.chatId));
      if (!chat) {
        return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
      }

      const currentStatus = String(deployment.status || "pending");
      const isTerminal =
        currentStatus === "ready" || currentStatus === "error" || currentStatus === "cancelled";

      if (deployment.vercelDeploymentId && !isTerminal) {
        try {
          const vercel = await getVercelDeployment(deployment.vercelDeploymentId);
          const mapped = mapVercelReadyStateToStatus(vercel.readyState);
          const liveUrl = await resolveDeploymentLiveUrlForChat({
            chatId: deployment.chatId,
            providerUrl: vercel.url,
            fallbackUrl: deployment.url,
          });

          try {
            const refreshWrite = await updateDeploymentStatus(deploymentId, mapped.status, {
              providerUrl: vercel.url ?? undefined,
              url: liveUrl ?? undefined,
              inspectorUrl: vercel.inspectorUrl ?? undefined,
              vercelProjectId: vercel.vercelProjectId ?? undefined,
            });
            // BB#deploy2: vinner denna GET-refresh den atomiska övergången
            // till `error` äger den loggen — webhook/poll ser efteråt
            // transitionedToError=false och loggar inte.
            if (refreshWrite.transitionedToError) {
              await logDeployError({
                chatId: deployment.chatId,
                versionId: deployment.versionId,
                deploymentId: deployment.id,
                vercelDeploymentId: deployment.vercelDeploymentId,
                inspectorUrl: vercel.inspectorUrl ?? null,
                message: "Hosting-bygget misslyckades (fångat vid statusuppdatering).",
                source: "refresh",
              }).catch(() => {});
            }
          } catch (dbErr) {
            console.error("Failed to persist deployment status:", dbErr);
          }

          return NextResponse.json({
            id: deployment.id,
            chatId: deployment.chatId,
            versionId: deployment.versionId,
            status: mapped.status,
            url: liveUrl,
            providerUrl: vercel.url ?? deployment.providerUrl,
            inspectorUrl: vercel.inspectorUrl ?? deployment.inspectorUrl,
            vercelDeploymentId: deployment.vercelDeploymentId,
            vercelProjectId: vercel.vercelProjectId ?? deployment.vercelProjectId,
            readyState: vercel.readyState,
            createdAt: deployment.createdAt,
            updatedAt: new Date(),
          });
        } catch (vercelErr) {
          console.error("Failed to refresh deployment status from Vercel:", vercelErr);
        }
      }

      return NextResponse.json({
        id: deployment.id,
        chatId: deployment.chatId,
        versionId: deployment.versionId,
        status: deployment.status,
        url: await resolveDeploymentLiveUrlForChat({
          chatId: deployment.chatId,
          providerUrl: deployment.providerUrl,
          fallbackUrl: deployment.url,
        }),
        providerUrl: deployment.providerUrl,
        inspectorUrl: deployment.inspectorUrl,
        vercelDeploymentId: deployment.vercelDeploymentId,
        vercelProjectId: deployment.vercelProjectId,
        createdAt: deployment.createdAt,
        updatedAt: deployment.updatedAt,
      });
    } catch (err) {
      console.error("Get deployment error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
