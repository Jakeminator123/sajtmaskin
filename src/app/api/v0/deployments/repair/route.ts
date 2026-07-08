import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { withRateLimit } from "@/lib/rateLimit";
import { requireNotBot } from "@/lib/botProtection";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { runDeployBuildRepair } from "@/lib/deploy/deploy-repair";

export const runtime = "nodejs";
// Synkron repair-loop (LLM-pass + preview-host verify). Håll linje med den
// manuella engine-repair-route:n; `REPAIR_LOOP_BUDGET_MS` binder loopen strax
// under detta tak så leasen alltid hinner släppas före platform-kill.
export const maxDuration = 800;

const requestSchema = z.object({
  chatId: z.string().min(1, "chatId is required"),
  versionId: z.string().min(1, "versionId is required"),
  deploymentId: z.string().min(1, "deploymentId is required"),
});

/**
 * A3 — "Publicera om med fix".
 *
 * MANUELL endpoint som repair-knappen anropar när en publicering gått till
 * `error` (asynkront Vercel-build-fel). Kör en repair mot den failade versionens
 * filer med bygg-felstexten som kontext och sparar en `repair_available`-version
 * som användaren sedan accepterar + publicerar om MANUELLT.
 *
 * Låst beslut Ö3: promota ALDRIG, redeploya ALDRIG. Idempotent — ett andra
 * anrop på en redan reparerad (eller pågående) version blir en no-op.
 */
export async function POST(req: Request) {
  return withRateLimit(req, "deployment:repair", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      const body = await req.json().catch(() => ({}));
      const parsed = requestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const { chatId, versionId, deploymentId } = parsed.data;

      // Tenant-guard: versionen OCH dess engine-chat måste ägas av anroparen.
      // Generic 404 för okänd/främmande version — avslöja aldrig existens.
      const scoped = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
      if (!scoped) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }

      // Deployment-guard: raden måste finnas OCH tillhöra exakt denna chat +
      // version. Slås upp per id men verifieras mot den tenant-scopade chatten,
      // så ett främmande/felmatchat deploymentId ger 404 (aldrig cross-tenant).
      const rows = await db
        .select()
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
        .limit(1);
      const deployment = rows[0];
      if (
        !deployment ||
        deployment.chatId !== scoped.chat.id ||
        deployment.versionId !== versionId
      ) {
        return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
      }

      // Repair är bara meningsfullt för en FAILAD publicering.
      if (deployment.status !== "error") {
        return NextResponse.json(
          {
            error:
              "Den här publiceringen har inte failat, så det finns inget att reparera.",
            code: "DEPLOY_NOT_FAILED",
            status: deployment.status ?? null,
          },
          { status: 409 },
        );
      }

      // Idempotens (per failad deployment): en redan producerad repair
      // (`repair_available`) betyder att ett tidigare anrop redan lyckats —
      // andra anropet blir en no-op. Distributed lease + `inflight` täcker den
      // SAMTIDIGA dubbelkörningen inne i `triggerBuildErrorRepair`.
      if (scoped.version.verification_state === "repair_available") {
        return NextResponse.json({
          status: "repair_available",
          alreadyAvailable: true,
          versionId,
          summary: scoped.version.verification_summary ?? null,
          message:
            "En fix finns redan sparad. Granska och acceptera reparationen, publicera sedan om.",
        });
      }

      const inspectorNote = deployment.inspectorUrl
        ? ` Byggdetaljer: ${deployment.inspectorUrl}`
        : "";
      const fallbackMessage =
        `Vercel-bygget misslyckades för den publicerade versionen (deployment ${deploymentId}).${inspectorNote}`;

      const result = await runDeployBuildRepair({
        chatId,
        versionId,
        vercelDeploymentId: deployment.vercelDeploymentId,
        fallbackMessage,
      });

      switch (result.status) {
        case "repair_available":
          return NextResponse.json({
            status: "repair_available",
            versionId,
            summary: result.summary ?? null,
            repairAvailableAt: result.repairAvailableAt ?? null,
            message:
              "En fix är klar. Granska och acceptera reparationen, publicera sedan om.",
          });
        case "repairing":
          return NextResponse.json(
            {
              status: "repairing",
              code: "REPAIR_IN_PROGRESS",
              message: "En reparation körs redan för den här versionen. Försök igen strax.",
            },
            { status: 409 },
          );
        case "superseded":
          return NextResponse.json(
            {
              status: "superseded",
              code: "NEWER_VERSION_EXISTS",
              message:
                "En nyare version finns. Reparera och publicera om den senaste versionen i stället.",
            },
            { status: 409 },
          );
        case "unavailable":
          return NextResponse.json(
            {
              status: "unavailable",
              code: "REPAIR_UNAVAILABLE",
              message:
                "Automatisk reparation är inte tillgänglig just nu. Försök igen senare eller redigera filen manuellt.",
            },
            { status: 503 },
          );
        case "failed":
        default:
          return NextResponse.json({
            status: "failed",
            versionId,
            message:
              "Reparationen kunde inte åtgärda bygget. Försök igen eller redigera filen manuellt och publicera om.",
          });
      }
    } catch (err) {
      console.error("[deploy-repair] Error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Deploy repair failed" },
        { status: 500 },
      );
    }
  });
}
