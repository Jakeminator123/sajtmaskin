import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getVercelDeployment, mapVercelReadyStateToStatus } from "@/lib/vercelDeploy";
import { updateDeploymentStatus } from "@/lib/deployment";
import { createRedisSubscriber, deployStatusChannel } from "@/lib/redis-pubsub";
import { getChatByIdForRequest } from "@/lib/tenant";

export const runtime = "nodejs";
export const maxDuration = 120;

const TERMINAL_STATUSES = new Set(["ready", "error", "cancelled"]);
const POLL_INTERVAL_MS = 4000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  const { deploymentId } = await params;

  const result = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);

  if (result.length === 0) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const deployment = result[0];
  const ownedChat = await getChatByIdForRequest(req, deployment.chatId);
  if (!ownedChat) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let pollStarted = false;
      let sub: ReturnType<typeof createRedisSubscriber> = null;

      function send(data: Record<string, unknown>) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      }

      function close() {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {}
      }

      function disconnectSubscriber() {
        if (!sub) return;
        sub.unsubscribe().catch(() => {});
        sub.disconnect();
        sub = null;
      }

      send({
        status: deployment.status ?? "pending",
        url: deployment.url,
        inspectorUrl: deployment.inspectorUrl,
      });

      const currentStatus = (deployment.status as string) ?? "pending";
      if (TERMINAL_STATUSES.has(currentStatus)) {
        close();
        return;
      }

      const vercelDeploymentId = deployment.vercelDeploymentId;
      if (!vercelDeploymentId) {
        close();
        return;
      }

      // Fallback: poll Vercel API when Redis is unavailable or fails
      const poll = async () => {
        while (!closed) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (closed) break;

          try {
            const vd = await getVercelDeployment(vercelDeploymentId);
            const mapped = mapVercelReadyStateToStatus(vd.readyState);

            send({
              status: mapped.status,
              url: vd.url ? `https://${vd.url}` : null,
              inspectorUrl: vd.inspectorUrl,
            });

            try {
              await updateDeploymentStatus(deploymentId, mapped.status, {
                url: vd.url || undefined,
                inspectorUrl: vd.inspectorUrl || undefined,
              });
            } catch {}

            if (TERMINAL_STATUSES.has(mapped.status)) {
              close();
            }
          } catch {}
        }
      };

      function startPollingFallback() {
        if (pollStarted || closed) return;
        pollStarted = true;
        void poll();
      }

      req.signal.addEventListener("abort", () => {
        disconnectSubscriber();
        close();
      });

      sub = createRedisSubscriber();
      if (sub) {
        const channel = deployStatusChannel(vercelDeploymentId);

        sub.subscribe(channel).catch(() => {
          disconnectSubscriber();
          startPollingFallback();
        });

        sub.on("message", (_ch: string, message: string) => {
          try {
            const data = JSON.parse(message);
            send(data);
            if (TERMINAL_STATUSES.has(data.status)) {
              disconnectSubscriber();
              close();
            }
          } catch {}
        });

        sub.on("error", () => {
          disconnectSubscriber();
          startPollingFallback();
        });

        return;
      }

      startPollingFallback();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
