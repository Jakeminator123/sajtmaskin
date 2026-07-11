/**
 * Bounded migration for already-published generated sites.
 *
 * Dry-run is the default. `--apply` performs DB + Vercel writes and therefore
 * requires the normal production-like DB write acknowledgement.
 */
import { config } from "dotenv";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { assertSafeWriteTarget } from "./db-target-guard.mjs";

config({ path: ".env.local" });
const [{ db }, { appProjects, deployments, engineChats }, projectServices, deploymentServices, liveUrls, vercelDeploy] =
  await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
    import("@/lib/db/services/projects"),
    import("@/lib/deployment"),
    import("@/lib/live-site-url"),
    import("@/lib/vercelDeploy"),
  ]);
const {
  clearProjectBrandedDomainVerification,
  ensureProjectPublishedIdentity,
  markProjectBrandedDomainVerified,
  setProjectVercelLink,
  setProjectVerifiedCustomDomain,
} = projectServices;
const { getBrandedLiveSiteDomain, slugCandidate } = liveUrls;
const { checkVercelProjectDomain, ensureVercelProjectDomain } = vercelDeploy;
const { setLatestDeploymentLiveUrlForChat } = deploymentServices;

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const projectArg = process.argv.find((arg) => arg.startsWith("--project-id="));
const limit = Math.max(1, Math.min(100, Number(limitArg?.split("=")[1] ?? 10)));
const onlyProjectId = projectArg?.split("=")[1]?.trim() || null;

if (!getBrandedLiveSiteDomain()) {
  throw new Error(
    "Set SAJTMASKIN_BRANDED_LIVE_URLS=true and SAJTMASKIN_LIVE_SITE_DOMAIN before migration.",
  );
}
if (apply) {
  assertSafeWriteTarget({ commandName: "domains:brand:migrate" });
}

const rows = await db
  .select()
  .from(appProjects)
  .orderBy(asc(appProjects.created_at));

let processed = 0;
for (const project of rows) {
  if (onlyProjectId && project.id !== onlyProjectId) continue;
  const chats = await db
    .select({ id: engineChats.id })
    .from(engineChats)
    .where(eq(engineChats.projectId, project.id));
  const chatIds = chats.map((chat) => chat.id);
  // Migration is intentionally stricter than runtime fallback: only an actual
  // READY deployment proves this project is published and owns a live Vercel
  // target. Never trust the app_projects cache over deployment history here.
  const latestReadyDeployment =
    chatIds.length > 0
      ? (
          await db
            .select({ vercelProjectId: deployments.vercelProjectId })
            .from(deployments)
            .where(
              and(
                inArray(deployments.chatId, chatIds),
                eq(deployments.status, "ready"),
                isNotNull(deployments.vercelProjectId),
              ),
            )
            .orderBy(desc(deployments.createdAt))
            .limit(1)
        )[0]
      : null;
  const vercelProjectId =
    latestReadyDeployment?.vercelProjectId?.trim() || null;
  if (!vercelProjectId) continue;
  const legacyDomain =
    chatIds.length > 0
      ? (
          await db
            .select({ domain: deployments.domain })
            .from(deployments)
            .where(
              and(
                inArray(deployments.chatId, chatIds),
                isNotNull(deployments.domain),
              ),
            )
            .orderBy(desc(deployments.createdAt))
            .limit(1)
        )[0]?.domain?.trim() || null
      : null;
  processed += 1;
  if (processed > limit) break;
  const candidate = project.published_slug?.trim() || slugCandidate(project.name);
  if (!apply) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        projectId: project.id,
        projectName: project.name,
        vercelProjectId,
        slugCandidate: candidate,
        legacyCustomDomain: legacyDomain,
      }),
    );
    continue;
  }

  const identity = await ensureProjectPublishedIdentity(project.id, project.name);
  if (!project.vercel_project_id) {
    await setProjectVercelLink(project.id, { vercelProjectId });
  }
  if (!identity?.brandedDomain) continue;
  const alias = await ensureVercelProjectDomain(
    vercelProjectId,
    identity.brandedDomain,
  );
  if (alias.verified) {
    const marked = await markProjectBrandedDomainVerified(project.id, alias.name);
    if (!marked) throw new Error(`Could not persist verified domain for ${project.id}`);
    for (const chat of chats) {
      await setLatestDeploymentLiveUrlForChat(chat.id, alias.name);
    }
  } else {
    await clearProjectBrandedDomainVerification(project.id, alias.name);
  }
  if (legacyDomain) {
    const customDomainConfigured = await checkVercelProjectDomain(
      vercelProjectId,
      legacyDomain,
    );
    if (customDomainConfigured === true) {
      await setProjectVerifiedCustomDomain(project.id, legacyDomain);
      for (const chat of chats) {
        await setLatestDeploymentLiveUrlForChat(chat.id, legacyDomain);
      }
    }
  }
  console.log(
    JSON.stringify({
      mode: "apply",
      projectId: project.id,
      domain: alias.name,
      verified: alias.verified,
    }),
  );
}
