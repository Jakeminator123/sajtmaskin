/**
 * Bounded migration for already-published generated sites.
 *
 * Dry-run is the default. `--apply` is rejected until A4 can bind the reviewed
 * bytes to the immutable provider deployment that will receive the alias.
 */
import { config } from "dotenv";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getBrandedLiveSiteDomain } from "@/lib/live-site-url";
import {
  assertBrandedLiveUrlMigrationMode,
  brandedMigrationBindState,
  parseBrandedLiveUrlMigrationArgs,
  planBrandedMigrationRollback,
  resolveBrandedLiveUrlMigrationPolicy,
  resolveBrandedMigrationPrimaryAddress,
  selectBrandedMigrationDeployment,
  shouldProcessBrandedMigrationProject,
} from "./migrate-branded-live-urls-policy";

const cli = parseBrandedLiveUrlMigrationArgs(process.argv);
const apply = cli.apply;
assertBrandedLiveUrlMigrationMode(process.argv);
config({ path: ".env.local" });
if (!getBrandedLiveSiteDomain()) {
  throw new Error(
    "Set SAJTMASKIN_BRANDED_LIVE_URLS=true and SAJTMASKIN_LIVE_SITE_DOMAIN before migration.",
  );
}

async function main(): Promise<void> {
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
const { slugCandidate } = liveUrls;
const { checkVercelProjectDomain, ensureVercelProjectDomain } = vercelDeploy;
const { setLatestDeploymentLiveUrlForChat } = deploymentServices;
const { getVersionFilesSnapshot } = versionManager;
const { resolveSelectedDossiersWithVersionPresence } = dossierPresence;
const limit = cli.limit;
const onlyProjectId = cli.onlyProjectId;
const attestedProductionDeploymentId = cli.attestedProductionDeploymentId;
const rows = await db
  .select()
  .from(appProjects)
  .orderBy(asc(appProjects.created_at));

if (cli.unboundedScan) {
  console.log(
    JSON.stringify({
      mode: "dry-run",
      warning: "unbounded_limit_scan",
      note: "En ensam --limit är inte explicit urval. Skicka --project-id= för ett projekt.",
    }),
  );
}

let processed = 0;
for (const project of rows) {
  if (!shouldProcessBrandedMigrationProject(project.id, onlyProjectId)) continue;
  const chats = await db
    .select({ id: engineChats.id, orchestrationSnapshot: engineChats.orchestrationSnapshot })
    .from(engineChats)
    .where(eq(engineChats.projectId, project.id));
  const chatIds = chats.map((chat) => chat.id);
  // Never treat newest READY as the migration target. That row is diagnostic
  // only until Vercel production identity is attested (#1391).
  const readyRows =
    chatIds.length > 0
      ? await db
          .select({
            chatId: deployments.chatId,
            versionId: deployments.versionId,
            vercelProjectId: deployments.vercelProjectId,
            vercelDeploymentId: deployments.vercelDeploymentId,
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
          .limit(25)
      : [];
  const latestReadyDeployment = readyRows[0] ?? null;
  const selected = selectBrandedMigrationDeployment({
    rows: readyRows,
    attestedProductionDeploymentId,
    attestedVercelProjectId: project.vercel_project_id?.trim() || null,
  });
  if (selected.status !== "selected" || !selected.row?.versionId || !selected.row.vercelProjectId) {
    processed += 1;
    if (processed > limit) break;
    console.log(
      JSON.stringify({
        mode: "skip",
        requestedMode: apply ? "apply" : "dry-run",
        projectId: project.id,
        reason: "production_identity_unknown",
        latestReadyVersionId: latestReadyDeployment?.versionId ?? null,
        latestReadyVercelDeploymentId: latestReadyDeployment?.vercelDeploymentId ?? null,
        note: "latest READY är bara diagnostik. Skicka --production-deployment-id= för Vercel production.",
        unboundedScan: cli.unboundedScan,
      }),
    );
    continue;
  }
  const vercelProjectId = selected.row.vercelProjectId.trim();
  const versionId = selected.row.versionId.trim();
  const verifiedCustomDomain =
    project.custom_domain?.trim() && project.custom_domain_verified_at
      ? project.custom_domain.trim()
      : null;
  const legacyDomain =
    verifiedCustomDomain ??
    (chatIds.length > 0
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
      : null);
  processed += 1;
  if (processed > limit) break;
  const versionSnapshot = await getVersionFilesSnapshot(versionId);
  const chatSnapshot = chats.find(
    (chat) => chat.id === selected.row?.chatId,
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
        latestReadyVersionId: latestReadyDeployment?.versionId ?? null,
      }),
    );
    continue;
  }
  const candidate = project.published_slug?.trim() || slugCandidate(project.name);
  const brandedCandidate = project.branded_domain?.trim() || null;
  const primary = resolveBrandedMigrationPrimaryAddress({
    verifiedCustomDomain,
    brandedCandidate,
  });
  const bindState = brandedCandidate
    ? brandedMigrationBindState({
        desiredHost: brandedCandidate,
        boundHost: project.branded_domain?.trim() || null,
        boundVerified: Boolean(project.branded_domain_verified_at),
      })
    : "needs_bind";
  const rollback = planBrandedMigrationRollback({
    verifiedCustomDomain,
    brandedHost: brandedCandidate,
  });
  if (!apply) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        projectId: project.id,
        projectName: project.name,
        versionId,
        filesRevision: versionSnapshot?.filesRevision ?? null,
        vercelProjectId,
        productionDeploymentId: selected.row.vercelDeploymentId ?? null,
        slugCandidate: candidate,
        legacyCustomDomain: legacyDomain,
        primaryAddress: primary,
        customDomainWins: primary.kind === "custom",
        bindState,
        rollback,
        latestReadyVersionId: latestReadyDeployment?.versionId ?? null,
        latestReadyIsSelected:
          latestReadyDeployment?.vercelDeploymentId === selected.row.vercelDeploymentId,
        unboundedScan: cli.unboundedScan,
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
}

void main();
