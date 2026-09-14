/**
 * Bounded migration for already-published generated sites.
 *
 * Dry-run is the default. `--apply` is rejected until A4 can bind the reviewed
 * bytes to the immutable provider deployment that will receive the alias.
 */
import { config } from "dotenv";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  assertBrandedLiveUrlMigrationMode,
  resolveBrandedLiveUrlMigrationPolicy,
} from "./migrate-branded-live-urls-policy";

const apply = process.argv.includes("--apply");
assertBrandedLiveUrlMigrationMode(process.argv);
config({ path: ".env.local" });
const [
  { db },
  { appProjects, deployments, engineChats },
  projectServices,
  deploymentServices,
  liveUrls,
  vercelDeploy,
  versionManager,
  dossierPresence,
] = await Promise.all([
  import("@/lib/db/client"),
  import("@/lib/db/schema"),
  import("@/lib/db/services/projects"),
  import("@/lib/deployment"),
  import("@/lib/live-site-url"),
  import("@/lib/vercel/vercel-deploy"),
  import("@/lib/gen/version-manager"),
  import("@/lib/gen/dossiers/version-presence"),
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
const { getVersionFilesSnapshot } = versionManager;
const { resolveSelectedDossiersWithVersionPresence } = dossierPresence;
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const projectArg = process.argv.find((arg) => arg.startsWith("--project-id="));
const limit = Math.max(1, Math.min(100, Number(limitArg?.split("=")[1] ?? 10)));
const onlyProjectId = projectArg?.split("=")[1]?.trim() || null;

if (!getBrandedLiveSiteDomain()) {
  throw new Error(
    "Set SAJTMASKIN_BRANDED_LIVE_URLS=true and SAJTMASKIN_LIVE_SITE_DOMAIN before migration.",
  );
}
const rows = await db
  .select()
  .from(appProjects)
  .orderBy(asc(appProjects.created_at));

let processed = 0;
for (const project of rows) {
  if (onlyProjectId && project.id !== onlyProjectId) continue;
  const chats = await db
    .select({ id: engineChats.id, orchestrationSnapshot: engineChats.orchestrationSnapshot })
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
            .select({
              chatId: deployments.chatId,
              versionId: deployments.versionId,
              vercelProjectId: deployments.vercelProjectId,
            })
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
  const vercelProjectId = latestReadyDeployment?.vercelProjectId?.trim() || null;
  const versionId = latestReadyDeployment?.versionId?.trim() || null;
  if (!vercelProjectId || !versionId) continue;
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
  const versionSnapshot = await getVersionFilesSnapshot(versionId);
  const chatSnapshot = chats.find(
    (chat) => chat.id === latestReadyDeployment?.chatId,
  )?.orchestrationSnapshot;
  const selectedDossiers = resolveSelectedDossiersWithVersionPresence({
    snapshot: chatSnapshot,
    versionFiles: versionSnapshot?.files ?? [],
  });
  const pilotDecision = resolveBrandedLiveUrlMigrationPolicy({
    projectId: project.id,
    versionId,
    filesRevision: versionSnapshot?.filesRevision ?? null,
    snapshot: chatSnapshot,
    selectedDossiers,
  });
  if (!pilotDecision.allowed) {
    console.log(
      JSON.stringify({
        mode: "skip",
        requestedMode: apply ? "apply" : "dry-run",
        projectId: project.id,
        versionId,
        reason: pilotDecision.reason,
        rejectedCapabilities: pilotDecision.rejectedCapabilities,
      }),
    );
    continue;
  }
  const candidate = project.published_slug?.trim() || slugCandidate(project.name);
  if (!apply) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        projectId: project.id,
        projectName: project.name,
        versionId,
        filesRevision: versionSnapshot?.filesRevision ?? null,
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
      versionId,
      domain: alias.name,
      verified: alias.verified,
    }),
  );
}
