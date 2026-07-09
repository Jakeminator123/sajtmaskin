import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getVercelDeployment, mapVercelReadyStateToStatus } from "@/lib/vercelDeploy";
import { updateDeploymentStatus } from "@/lib/deployment";
import { logDeployError } from "@/lib/deploy/deploy-error-log";
import { createRedisSubscriber, deployStatusChannel } from "@/lib/redis-pubsub";
import { getChatByIdForRequest, getEngineChatByIdForRequest } from "@/lib/tenant";
import { withRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

const TERMINAL_STATUSES = new Set(["ready", "error", "cancelled"]);
const POLL_INTERVAL_MS = 4000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  return withRateLimit(req, "v0:deployments-events", async () => {
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
    // Own-engine chats are the primary path — deployment rows are keyed by the
    // engine chat id, so a v0-only lookup 404:ade ALLA own-engine-strömmar och
    // headern satt kvar på "pending" (A#3). Auth engine-first med legacy
    // v0-fallback, samma mönster som deployments-GET:en.
    const ownedChat =
      (await getEngineChatByIdForRequest(req, deployment.chatId)) ??
      (await getChatByIdForRequest(req, deployment.chatId));
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
        // A3: logga ett asynkront deploy-fel högst en gång per stream (poll kan
        // annars återbesöka error innan close()).
        let deployErrorLogged = false;
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
          // Släpp alltid Redis-subscribern vid stream-slut. Poll-vägen nådde
          // tidigare terminal status och stängde utan disconnect → läckt
          // subscriber-anslutning per avslutad deploy (VADE-fynd på #443).
          disconnectSubscriber();
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
              } catch (persistErr) {
                // SAJ-58: client got the new status via SSE, but the DB row
                // didn't update. List/API consumers reading `deployments`
                // will then show stale state. Surface in logs so we can spot
                // the divergence; clients still see the live SSE stream.
                console.warn(
                  "[deployments-sse] updateDeploymentStatus failed; DB may lag Vercel",
                  {
                    deploymentId,
                    vercelDeploymentId,
                    attemptedStatus: mapped.status,
                    error: persistErr instanceof Error ? persistErr.message : String(persistErr),
                  },
                );
              }

              // A3: ett asynkront Vercel-build-fel som fångas via poll (Redis
              // saknas/tappade meddelandet) loggas ordentligt (DB + RAG + bus),
              // precis som webhook-vägen. Best-effort, en gång per stream.
              if (mapped.status === "error" && !deployErrorLogged) {
                deployErrorLogged = true;
                await logDeployError({
                  chatId: deployment.chatId,
                  versionId: deployment.versionId,
                  deploymentId,
                  vercelDeploymentId,
                  inspectorUrl: vd.inspectorUrl,
                  message: "Vercel-bygget misslyckades (fångat via statuspoll).",
                  source: "poll",
                }).catch(() => {});
              }

              if (TERMINAL_STATUSES.has(mapped.status)) {
                close();
              }
            } catch (pollErr) {
              // SAJ-58: a single Vercel-poll failure shouldn't kill the loop
              // (transient 429/5xx are common), but silent swallowing meant
              // we couldn't tell tight retry-loops apart from real outages.
              console.warn("[deployments-sse] poll iteration failed", {
                deploymentId,
                vercelDeploymentId,
                error: pollErr instanceof Error ? pollErr.message : String(pollErr),
              });
            }
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
          });
        }

        // Active safety net: ALWAYS poll Vercel directly, even when the Redis
        // subscription is connected. The Redis push only arrives when `POST
        // /api/webhooks/vercel` runs for this exact deployment — if the
        // webhook is unconfigured/unregistered on the Vercel project (or a
        // message is dropped), a push-only stream would sit at "building"
        // forever even though Vercel already resolved the deploy (confirmed
        // in prod: rows stuck permanently). Polling is idempotent with the
        // Redis path — both just re-apply the same (eventually terminal)
        // status via `send`/`updateDeploymentStatus`.
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
  });
}
