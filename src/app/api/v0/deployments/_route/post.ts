import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
import {
  createDeploymentRecord,
  resolveCanonicalVercelProjectForDomain,
  updateDeploymentStatus,
} from "@/lib/deployment";
import { materializeImagesInTextFiles, type ImageAssetStrategy } from "@/lib/image-assets";
import {
  createVercelDeployment,
  checkVercelProjectDomain,
  buildGeneratedVercelProjectName,
  ensureVercelProject,
  mapVercelReadyStateToStatus,
  ensureVercelProjectDomain,
  sanitizeVercelProjectName,
  syncEnvVarsToVercelProject,
  toVercelFilesFromTextFiles,
} from "@/lib/vercel/vercel-deploy";
import { getAppProjectByIdForRequest, getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { requireNotBot } from "@/lib/bot-protection";
import { devLogAppend } from "@/lib/logging/dev-log";
import { prepareCredits } from "@/lib/credits/server";
import { InsufficientCreditsError } from "@/lib/db/services/transactions";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { logDeployError } from "@/lib/deploy/deploy-error-log";
import { recordDeployResultForVersion } from "@/lib/db/services/generation-telemetry";
import { resolveDeployReleaseGate } from "@/lib/db/engine-version-lifecycle";
import { buildDeployReadiness } from "@/lib/deploy/deploy-readiness";
import {
  resolveProjectEnv,
  resolveEnvRequirementsFromVersionFiles,
} from "@/lib/project-env-resolver";
import { resolveSelectedDossiersWithVersionPresence } from "@/lib/gen/dossiers/version-presence";
import {
  clearProjectBrandedDomainVerification,
  clearProjectCustomDomainVerification,
  ensureProjectPublishedIdentity,
  getProjectData,
  markProjectBrandedDomainVerified,
  setProjectVercelLink,
} from "@/lib/db/services/projects";
import { readSeoPreferencesFromMeta } from "@/lib/projects/preferences-schema";
import { resolveDeploySeoOptions } from "../resolve-seo";
import { runSeoPublishPass } from "@/lib/seo";
import { resolveSeoCopyModelId, toSeoReportPayload } from "../seo-publish";
import { isGeneratedEnvLocalPath } from "@/lib/gen/export/strip-env-local-for-zip";
import { buildEnvDegradationWarnings } from "../env-degradation-warnings";
import { getBrandedLiveSiteDomain, resolveLiveUrl } from "@/lib/live-site-url";
import { createDeploymentSchema } from "./schema";
import { classifyDeployError } from "./error-mapping";
import { runPreDeployFixPipeline, shouldSkipPreDeployAutoFix } from "./pre-deploy-fix";

export async function POST(req: Request) {
  return withRateLimit(req, "deployment:create", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      const body = await req.json().catch(() => ({}));
      const validationResult = createDeploymentSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 },
        );
      }

      const {
        chatId,
        versionId,
        projectName,
        target,
        imageStrategy,
        projectId,
        precheckOnly,
        skipAutoFix,
        seo: bodySeo,
      } = validationResult.data;
      const skipPreDeployAutoFix = shouldSkipPreDeployAutoFix(skipAutoFix);
      const resolvedImageStrategy: ImageAssetStrategy =
        imageStrategy ?? (process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "external");
      const deployTarget = target === "preview" ? "preview" : "production";

      let creditCheck: Awaited<ReturnType<typeof prepareCredits>> | null = null;
      if (!precheckOnly) {
        const prepared = await prepareCredits(
          req,
          deployTarget === "preview" ? "deploy.preview" : "deploy.production",
          { target: deployTarget },
        );
        if (!prepared.ok) {
          return prepared.response;
        }
        creditCheck = prepared;
      }

      // Tenant-scoped resolution: the version AND its engine chat must belong to
      // the caller's own app-project. `getEngineVersionForChatByIdForRequest`
      // resolves the version, confirms it belongs to `chatId`, and confirms the
      // chat's `app_projects` row is owned by the requester (via the same guard
      // as GET/link/verify) — otherwise it returns null. This closes the
      // orphan-chat hole: previously an attacker who knew a valid
      // `chatId`+`versionId` for a chat with `project_id = null` could publish
      // that (another tenant's) version under their OWN body `projectId`,
      // because only the body project was tenant-checked. The chat/version were
      // fetched with the unscoped `getChat`/`getVersionById`.
      const scoped = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
      if (!scoped) {
        // Generic 404 for "no such version", "version not in chat", orphan chat
        // and cross-tenant alike — never reveal whether the resource exists for
        // another tenant.
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }
      const { chat: engineChat, version: engineVersion } = scoped;
      // Publicera-lås (Ö1): hård ReleaseGate för F3/integrations — endast
      // bevisat gröna versioner (`verification_state === "passed"` eller
      // `release_state === "promoted"`) får publiceras. F2/design behåller
      // det mjuka beteendet: bara `failed` blockerar. Preview påverkas inte —
      // detta är publish-vägen. `precheckOnly` rapporterar F3-gate-status i
      // svaret (`releaseGate`) i stället för att kasta, men `failed` ger
      // alltid 409 precis som tidigare.
      const releaseGate = resolveDeployReleaseGate(engineVersion);
      if (!releaseGate.allowed && (releaseGate.code === "DEPLOY_VERSION_FAILED" || !precheckOnly)) {
        return NextResponse.json(
          {
            error: releaseGate.message,
            code: releaseGate.code,
          },
          { status: 409 },
        );
      }
      // The engine chat is tenant-guarded, so its `project_id` is an owned
      // app_projects id. A body `projectId` may only *confirm* that project —
      // it can never redirect the publish to a different (or foreign) project.
      const engineProjectId =
        typeof engineChat.project_id === "string" ? engineChat.project_id.trim() : "";
      if (!engineProjectId) {
        return NextResponse.json({ error: "Chat is not linked to a project" }, { status: 403 });
      }
      const requestedProjectId = projectId?.trim() || null;
      if (requestedProjectId && requestedProjectId !== engineProjectId) {
        return NextResponse.json(
          { error: "Project does not match chat ownership" },
          { status: 409 },
        );
      }
      // Defense-in-depth: re-confirm ownership of the resolved app-project and
      // fetch its persisted Vercel link (used for project-name reuse below).
      const ownedProject = await getAppProjectByIdForRequest(req, engineProjectId);
      if (!ownedProject) {
        return NextResponse.json(
          {
            error:
              "Project not found or access denied. Open the project again from the dashboard (session may have changed).",
            code: "DEPLOY_PROJECT_ACCESS",
          },
          { status: 403 },
        );
      }
      // Canonical Vercel project id + linked domain for this chat (BB#deploy4
      // + #519 P1/bugbot round 3): ONE call, so the domain the lock reports
      // (`linkedDomain`) and the project id it (and the deploy target below)
      // resolve to (`existingVercelProjectId`) can never diverge again — the
      // project-id priority MIRRORS whichever domain source actually won
      // (verified app_projects custom/branded domain → the generic
      // latest-deployment/app_projects-cache order; the legacy
      // `deployments.domain` row → that row's OWN id). See
      // `resolveCanonicalVercelProjectForDomain` in `deployment.ts` for the
      // full priority contract shared with the GET recheck below.
      const canonicalDomainProject = await resolveCanonicalVercelProjectForDomain(
        chatId,
        ownedProject,
      );
      const existingVercelProjectId = canonicalDomainProject.projectId;
      // Publicera-lås (Ö2 / A2): en kopplad custom-domän sitter på Vercel-
      // PROJEKTET (namn-baserat), inte på en enskild deployment. Om användaren
      // publicerar om med ett NYTT projectName skulle vi rikta mot ett annat
      // Vercel-projekt och lämna domänen kvar (orphan) på det gamla → domänen
      // pekar på gammal sajt. Därför: så länge en domän är kopplad för chatten
      // är projektnamnet LÅST. `precheckOnly` rapporterar låset i
      // `projectNameLock` i stället för att kasta (samma mönster som A1:s
      // `releaseGate`).
      const linkedDomain = canonicalDomainProject.domain;
      // Mirror the actual deployment target exactly. Once a provider project
      // is already known — either the persisted name cache OR the canonical
      // id above — a body `projectName` can NEVER retarget hosting:
      // `ensureVercelProject` below always resolves by id when one is known,
      // ignoring the requested name entirely. Legacy rows with no known
      // project at all derive the same collision-safe fallback name as the
      // deploy path, where the requested name genuinely determines the
      // brand-new project that gets created.
      const currentVercelProjectName = sanitizeVercelProjectName(
        (typeof ownedProject.vercel_project_name === "string"
          ? ownedProject.vercel_project_name.trim()
          : "") ||
          buildGeneratedVercelProjectName(
            ownedProject.name || `sajtmaskin-${chatId}`,
            engineProjectId,
          ),
      );
      // Bugbot (#519): trim the name cache — a whitespace-only
      // `vercel_project_name` must NOT count as a known project, or the lock
      // would compare two identical generated fallbacks (never locking) while
      // the deploy below targets a generated-name project the linked domain
      // may not be attached to. Matches the trim `currentVercelProjectName`
      // already applies.
      const hasKnownVercelProject = Boolean(
        (typeof ownedProject.vercel_project_name === "string" &&
          ownedProject.vercel_project_name.trim()) ||
        existingVercelProjectId,
      );
      const requestedVercelProjectName =
        typeof projectName === "string" && projectName.trim().length > 0
          ? hasKnownVercelProject
            ? currentVercelProjectName
            : buildGeneratedVercelProjectName(projectName, engineProjectId)
          : null;
      const projectNameLocked = Boolean(
        linkedDomain &&
        requestedVercelProjectName &&
        requestedVercelProjectName !== currentVercelProjectName,
      );
      const projectNameLock = {
        locked: projectNameLocked,
        domain: linkedDomain,
        currentProjectName: currentVercelProjectName,
        requestedProjectName: requestedVercelProjectName,
      };
      if (projectNameLocked && !precheckOnly) {
        return NextResponse.json(
          {
            error:
              `Projektnamnet är låst så länge domänen "${linkedDomain}" är kopplad. ` +
              `Publicera med samma namn ("${currentVercelProjectName}") eller koppla bort domänen först — ` +
              "ett nytt projektnamn skulle skapa ett nytt hosting-projekt och lämna domänen kvar på det gamla.",
            code: "DEPLOY_DOMAIN_LOCKED_PROJECT_NAME",
            projectNameLock,
          },
          { status: 409 },
        );
      }

      const codeFiles = await getVersionFiles(versionId);
      if (!codeFiles || codeFiles.length === 0) {
        return NextResponse.json({ error: "No files found for this version" }, { status: 404 });
      }

      // The generated placeholder `.env.local` (injected for the shared
      // verify/quality-gate lane, see `strip-env-local-for-zip.ts`) must never
      // ship to Vercel: it can shadow the real values configured on the
      // project. The ZIP/download export already strips it at its boundary;
      // this is the same strip applied at the deploy-file-assembly boundary.
      // `env.example` is intentionally kept — Next.js never reads it.
      const textFiles = codeFiles
        .filter((f) => !isGeneratedEnvLocalPath(f.path))
        .map((f) => ({ name: f.path, content: f.content }));

      const projectEnv = await resolveProjectEnv(engineProjectId ?? null);

      // Read persisted SEO preferences from `project_data.meta.seo`. Body
      // override (parsed above as `bodySeo`) wins over persisted preferences;
      // canonical project URL wins over both at apply time. Guarded so that a
      // missing project_data row doesn't fail the deploy.
      const persistedProjectData = await getProjectData(engineProjectId).catch(() => null);
      const persistedSeo = readSeoPreferencesFromMeta(
        (persistedProjectData?.meta as Record<string, unknown> | null | undefined) ?? null,
      );

      const {
        files: fixedFiles,
        fixesApplied,
        warnings,
        invalidFiles,
      } = runPreDeployFixPipeline(textFiles, skipPreDeployAutoFix);
      // Align with the readiness route (`readiness/route.ts`): pass the
      // version's ACTUAL lifecycle stage + selected dossiers so deploy counts
      // env requirements the same way readiness does. Without this, deploy
      // always evaluated F2 (`design`) env logic — for an F3 (`integrations`)
      // project that meant tier-3 placeholder-covered keys were silently
      // treated as "covered" instead of counted toward the real requirement,
      // so deploy and readiness could disagree on the same version.
      const lifecycleStage =
        typeof engineVersion.lifecycle_stage === "string"
          ? engineVersion.lifecycle_stage
          : "design";
      const envGateActive = lifecycleStage === "integrations";
      // Ägarbeslut 2026-07-22: placeholders alltid tillåtna i F3 (opt-in-
      // flaggan `allowPlaceholdersInF3` är borttagen — demoläge är default).
      const allowPlaceholdersInF3 = envGateActive;
      // One owner (review round 2): snapshot ∪ version-presence — parity with
      // the readiness route's set is real now (both call the shared resolver),
      // not just claimed. `codeFiles` was already loaded above (single read).
      const selectedDossiers = resolveSelectedDossiersWithVersionPresence({
        snapshot: engineChat.orchestration_snapshot,
        versionFiles: codeFiles,
      });
      const envRequirements = resolveEnvRequirementsFromVersionFiles(
        fixedFiles.map((f) => ({ path: f.name, content: f.content })),
        projectEnv,
        {
          lifecycleStage: envGateActive ? "integrations" : "design",
          allowPlaceholdersInF3,
          selectedDossiers,
        },
      );
      // The deploy gate hard-blocks on `buildBlockingKeys` (see the 409 below),
      // the SAME list the F3 readiness gate uses
      // (`app/api/engine/chats/[chatId]/readiness/route.ts`). Keys covered by
      // harmless/tier-3 stub placeholders (`placeholderCoveredKeys`) are
      // surfaced as warnings instead — Vercel gets whatever the user has
      // stored, and the rest can be filled in later.
      const placeholderCoveredWarnings =
        envRequirements.placeholderCoveredKeys.length > 0
          ? [
              `Miljövariabler täckta av platshållare (deployas utan riktiga värden tills du fyller i dem): ${envRequirements.placeholderCoveredKeys.join(", ")}`,
            ]
          : [];
      const deployReadiness = buildDeployReadiness({
        missingEnvKeys: envRequirements.missingEnvKeys,
        preDeployWarnings: [...warnings, ...placeholderCoveredWarnings],
        invalidFilePaths: invalidFiles,
      });
      // Structured, per-key warning for the UI (product decision: NEVER a
      // hard block — demo sites with an info sign must stay publishable).
      // Covers `placeholderCoveredKeys` (fake/tier-3 data) and
      // `featureRuntimeKeys` (component shows a config banner at runtime).
      // Build-blocking keys are intentionally excluded — those hard-block
      // below via `DEPLOY_MISSING_ENV` (`buildBlockingKeys`).
      const envWarnings = buildEnvDegradationWarnings({
        placeholderCoveredKeys: envRequirements.placeholderCoveredKeys,
        featureRuntimeKeys: envRequirements.featureRuntimeKeys,
        detectedIntegrations: envRequirements.detectedIntegrations,
      });

      if (precheckOnly) {
        return NextResponse.json({
          precheckOnly: true,
          chatId,
          versionId,
          projectId: engineProjectId,
          deployReadiness,
          // Publicera-låsets status (Ö1): en skarp deploy av samma version
          // skulle 409:a när `allowed` är false — precheck rapporterar i
          // stället så UI:t kan visa blockern tillsammans med env-status.
          releaseGate,
          // Projektnamn-lås (Ö2 / A2): en skarp deploy med ett nytt projectName
          // skulle 409:a (`DEPLOY_DOMAIN_LOCKED_PROJECT_NAME`) när en domän är
          // kopplad — precheck rapporterar i stället så UI:t kan varna innan
          // användaren försöker byta namn.
          projectNameLock,
          fixesApplied,
          preDeployWarnings: warnings,
          envWarnings,
          fileCount: fixedFiles.length,
        });
      }

      // R1 (Codex #443): the env gate is lifecycle-stage-dependent, mirroring
      // the readiness route (`app/api/engine/chats/[chatId]/readiness/route.ts`):
      //
      // - F3 (`integrations`): block on `buildBlockingKeys` — the SAME list the
      //   F3 readiness gate uses. `missingEnvKeys` also contains
      //   `feature-runtime`/`warn-only` keys (e.g. Resend `EMAIL_FROM`) that
      //   only degrade a single feature at runtime — blocking on those made
      //   deploy 409 while readiness said `canDeploy:true` (UI/API mismatch).
      // - F2 (`design`): block on `designDeployBlockingKeys` — the truly
      //   absent (`missingEnvKeys`) subset with `build` enforcement. The raw
      //   `missingEnvKeys` backstop also contained `feature-runtime`/
      //   `warn-only` keys (M#li2: Resend `EMAIL_FROM`/`CONTACT_EMAIL_TO`
      //   409'd a demo publish that readiness said was deployable). NOTE:
      //   `buildBlockingKeys` is still wrong for F2 — in design it also
      //   contains tier-3-placeholder-covered keys (allowPlaceholdersInF3 is
      //   always false there), so gating F2 on it would block demo publishes
      //   that must stay publishable (env-flow-f2-mute; bugbot high på #461).
      //
      // `missingEnvKeys` is still surfaced in `deployReadiness` for
      // observability in both stages.
      const envBlockingKeys = envGateActive
        ? envRequirements.buildBlockingKeys
        : envRequirements.designDeployBlockingKeys;
      if (envBlockingKeys.length > 0) {
        return NextResponse.json(
          {
            error:
              "Saknade miljövariabler måste konfigureras på projektet innan deploy (samma krav som i publiceringskollen).",
            code: "DEPLOY_MISSING_ENV",
            deployReadiness,
            buildBlockingKeys: envBlockingKeys,
            fixesApplied,
            preDeployWarnings: warnings,
          },
          { status: 409 },
        );
      }

      devLogAppend("latest", {
        type: "site.deploy.start",
        requestedChatId: chatId,
        requestedVersionId: versionId,
        source: "engine-postgres",
        target: deployTarget,
        imageStrategy: resolvedImageStrategy,
      });

      const deploymentId = await createDeploymentRecord({
        chatId,
        versionId,
      });

      // Pengaväg: track whether the credit debit landed so we can refund it if
      // the (irreversible) Vercel deploy fails after we charged. `deploymentDelivered`
      // flips true the moment Vercel accepts the deploy — after that a later error
      // (e.g. status/telemetry write) must NOT refund, or the user keeps a live
      // deploy AND their credits back.
      let creditCharged = false;
      let deploymentDelivered = false;

      try {
        // Charge before any external project/domain provisioning. Project and
        // alias creation are real provider-side resources too; an aborted
        // request must not create them for free. Any failure before Vercel
        // accepts the deployment is refunded by the catch block below.
        if (creditCheck) {
          try {
            await creditCheck.commit({ rejectIfNegative: true });
            creditCharged = true;
          } catch (chargeErr) {
            try {
              await updateDeploymentStatus(deploymentId, "error");
            } catch (statusErr) {
              console.error("[deploy] Failed to mark deployment as error:", statusErr);
            }
            if (chargeErr instanceof InsufficientCreditsError) {
              return NextResponse.json(
                {
                  error: `Du behöver ${chargeErr.required} credits för att publicera. Du har ${chargeErr.available}.`,
                  code: "DEPLOY_INSUFFICIENT_CREDITS",
                  insufficientCredits: true,
                  required: chargeErr.required,
                  current: chargeErr.available,
                },
                { status: 402 },
              );
            }
            console.error("[credits] Failed to charge deploy (pre-deploy):", chargeErr);
            return NextResponse.json(
              {
                error: "Kunde inte reservera credits för publicering. Försök igen.",
                code: "DEPLOY_CREDIT_CHARGE_FAILED",
              },
              { status: 402 },
            );
          }
        }

        // Reuse the SAME Vercel project across re-publishes: `existingVercelProjectId`
        // (BB#deploy4, resolved once above from the same source the domain
        // resolver uses) wins whenever a project is already known —
        // `ensureVercelProject` below resolves by that id and ignores the name
        // in that case. The generated fallback name only matters for a
        // genuinely first-ever deploy (no known project at all), where the
        // body name determines the brand-new project that gets created.
        const brandedRolloutEnabled = Boolean(getBrandedLiveSiteDomain());
        const vercelProjectName = hasKnownVercelProject
          ? currentVercelProjectName
          : sanitizeVercelProjectName(
              buildGeneratedVercelProjectName(
                projectName || ownedProject.name || `sajtmaskin-${chatId}`,
                engineProjectId,
              ),
            );
        const currentCustomDomain = ownedProject.custom_domain?.trim() || null;
        let currentCustomDomainVerifiedAt = ownedProject.custom_domain_verified_at ?? null;
        if (currentCustomDomain && currentCustomDomainVerifiedAt && existingVercelProjectId) {
          const customDomainValid = await checkVercelProjectDomain(
            existingVercelProjectId,
            currentCustomDomain,
          );
          if (customDomainValid === false) {
            await clearProjectCustomDomainVerification(engineProjectId, currentCustomDomain);
            currentCustomDomainVerifiedAt = null;
          }
        }
        const publishedIdentity = brandedRolloutEnabled
          ? await ensureProjectPublishedIdentity(
              engineProjectId,
              projectName || ownedProject.name || vercelProjectName,
            )
          : {
              publishedSlug: ownedProject.published_slug?.trim() || null,
              brandedDomain: null,
              brandedDomainVerifiedAt: null,
              customDomain: currentCustomDomain,
              customDomainVerifiedAt: currentCustomDomainVerifiedAt,
            };
        if (!publishedIdentity) {
          throw new Error("Could not reserve the project's public URL identity");
        }
        const ensuredProject = await ensureVercelProject(
          vercelProjectName,
          existingVercelProjectId,
        );
        const domainWarnings: string[] = [];
        let brandedDomainVerifiedAt = publishedIdentity.brandedDomainVerifiedAt;
        if (publishedIdentity.brandedDomain) {
          try {
            const alias = await ensureVercelProjectDomain(
              ensuredProject.id,
              publishedIdentity.brandedDomain,
            );
            if (alias.verified) {
              const marked = await markProjectBrandedDomainVerified(engineProjectId, alias.name);
              if (!marked) {
                throw new Error("The verified branded domain could not be persisted");
              }
              brandedDomainVerifiedAt = new Date();
            } else {
              await clearProjectBrandedDomainVerification(engineProjectId, alias.name);
              brandedDomainVerifiedAt = null;
              domainWarnings.push(
                `Sajtmaskin-adressen ${alias.name} väntar på DNS/TLS-verifiering. Den tekniska publiceringsadressen används tills dess.`,
              );
            }
          } catch (aliasErr) {
            domainWarnings.push(
              `Sajtmaskin-adressen kunde inte kopplas ännu: ${aliasErr instanceof Error ? aliasErr.message : String(aliasErr)}`,
            );
          }
        }
        const resolvedSeoOptions = resolveDeploySeoOptions(
          bodySeo,
          persistedSeo,
          resolveLiveUrl({
            brandedDomain: publishedIdentity.brandedDomain,
            brandedDomainVerifiedAt,
            customDomain: publishedIdentity.customDomain,
            customDomainVerifiedAt: publishedIdentity.customDomainVerifiedAt,
          }),
        );
        const envVarsForDeploy = projectEnv.configuredMap;
        if (fixesApplied.length > 0) {
          console.info("[deploy] applied fixes:", fixesApplied);
        }
        if (warnings.length > 0) {
          console.warn("[deploy] pre-deploy warnings:", warnings.slice(0, 5));
        }

        devLogAppend("latest", {
          type: "site.deploy.precheck",
          chatId,
          versionId,
          deploymentId,
          fixesApplied,
          warnings,
          fileCount: fixedFiles.length,
          deployReadiness,
        });

        // PR-B: apply project-specific SEO (robots/sitemap/opengraph +
        // layout metadata) when the user opted in via Bygg-dialog or
        // persisted preferences. Runs after pre-deploy auto-fix so SEO
        // files participate in image-asset materialization below, but
        // before the Vercel call so the deploy gets the enriched files.
        // No-op when `resolvedSeoOptions` is null → deploy-files identical
        // to today.
        //
        // The pass audits the files first and lets the findings decide what to
        // change, so the report we return describes real edits rather than the
        // fact that an injector ran. `runSeoPublishPass` never throws — a
        // failure ships the files untouched, because SEO must not be able to
        // block a publish.
        const seoPass =
          resolvedSeoOptions && resolvedSeoOptions.siteUrl
            ? await runSeoPublishPass(fixedFiles, {
                siteUrl: resolvedSeoOptions.siteUrl,
                brand: resolvedSeoOptions.brand ?? undefined,
                copyModelId: resolveSeoCopyModelId(),
              })
            : null;
        const seoApplyResult = seoPass
          ? {
              applied: seoPass.report.improvements.length > 0,
              files: seoPass.files,
              source: "override" as const,
              siteUrl: resolvedSeoOptions?.siteUrl ?? null,
              injected: seoPass.report.improvements
                .filter((i) => i.change.startsWith("Lade till"))
                .map((i) => i.file),
              enriched: seoPass.report.improvements
                .filter((i) => !i.change.startsWith("Lade till"))
                .map((i) => i.file),
            }
          : {
              applied: false as const,
              files: fixedFiles,
              source: "explicit-noop" as const,
              siteUrl: null,
              injected: [] as string[],
              enriched: [] as string[],
            };
        if (seoPass) {
          console.info("[deploy] SEO pass", {
            siteUrl: seoApplyResult.siteUrl,
            scoreBefore: seoPass.report.before.score,
            scoreAfter: seoPass.report.after.score,
            improvements: seoPass.report.improvements.length,
            remaining: seoPass.report.remaining.length,
          });
          devLogAppend("latest", {
            type: "site.deploy.seo-applied",
            chatId,
            versionId,
            deploymentId,
            siteUrl: seoApplyResult.siteUrl,
            source: seoApplyResult.source,
            injected: seoApplyResult.injected,
            enriched: seoApplyResult.enriched,
            scoreBefore: seoPass.report.before.score,
            scoreAfter: seoPass.report.after.score,
          });
        }
        const filesForDeploy = seoPass ? seoPass.files : fixedFiles;

        const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
        const imageAssets = await materializeImagesInTextFiles({
          files: filesForDeploy,
          strategy: resolvedImageStrategy,
          blobToken,
          namespace: { chatId, versionId },
        });

        if (imageAssets.warnings.length > 0) {
          console.info("[deploy] image assets warnings:", imageAssets.warnings.slice(0, 5));
        }

        const vercelFiles = toVercelFilesFromTextFiles(imageAssets.files);

        const created = await createVercelDeployment({
          projectName: ensuredProject.name,
          target: deployTarget,
          files: vercelFiles,
          envVars: envVarsForDeploy,
        });
        // Vercel accepted the deploy — it's now live/irreversible, so a later
        // failure below must not refund the charge.
        deploymentDelivered = true;
        const effectiveProjectId =
          created.vercelProjectId ?? ensuredProject?.id ?? ownedProject.vercel_project_id ?? null;

        // Refresh with the deployment response in case the provider canonicalized
        // project metadata. This remains best-effort after delivery.
        try {
          await setProjectVercelLink(engineProjectId, {
            vercelProjectId: effectiveProjectId,
            vercelProjectName: ensuredProject?.name ?? vercelProjectName,
          });
        } catch (linkErr) {
          console.warn("[deploy] Kunde inte spara Vercel-projektkoppling:", linkErr);
        }

        const liveUrl = resolveLiveUrl({
          providerUrl: created.url,
          brandedDomain: publishedIdentity.brandedDomain,
          brandedDomainVerifiedAt,
          customDomain: publishedIdentity.customDomain,
          customDomainVerifiedAt: publishedIdentity.customDomainVerifiedAt,
        });

        // `syncEnvVarsToVercelProject` upserts env vars on the Vercel PROJECT
        // so a later redeploy triggered outside Sajtmaskin (dashboard restart,
        // git push) still has them — THIS deploy already received the same
        // values inline via `createVercelDeployment`'s `envVars` above, so a
        // sync failure never affects what just went live. Runs after
        // `createVercelDeployment` on purpose: a first-time publish has no
        // `vercelProjectId` to sync to until Vercel creates the project as
        // part of that call. Best-effort — surfaced as a warning (not just a
        // server log) so the caller can tell the user their integrations may
        // need re-saving after a dashboard-triggered rebuild.
        const envSyncWarnings: string[] = [];
        if (effectiveProjectId) {
          const envSync = await syncEnvVarsToVercelProject(effectiveProjectId, envVarsForDeploy);
          if (envSync.errors.length > 0) {
            console.warn("[deploy] env var project sync errors:", envSync.errors);
            envSyncWarnings.push(
              `Miljövariabler kunde inte sparas på hosting-projektet (gäller framtida ombyggen utanför Sajtmaskin): ${envSync.errors.join(", ")}`,
            );
          }
        }

        const mapped = mapVercelReadyStateToStatus(created.readyState);
        const initialWrite = await updateDeploymentStatus(deploymentId, mapped.status, {
          vercelDeploymentId: created.vercelDeploymentId,
          vercelProjectId: effectiveProjectId ?? undefined,
          providerUrl: created.url ?? undefined,
          url: liveUrl ?? undefined,
          inspectorUrl: created.inspectorUrl ?? undefined,
        });
        // BB#deploy2: den som VINNER den atomiska övergången till `error` äger
        // loggen. Normalt är det webhook/SSE-poll, men vid ett synkront
        // Vercel-ERROR direkt i create-svaret kan denna initiala statusskrivning
        // vinna — utan logg här skulle build-felet aldrig nå DB/RAG/bus
        // (webhook/poll får transitionedToError=false efteråt).
        if (initialWrite.transitionedToError) {
          await logDeployError({
            chatId,
            versionId,
            deploymentId,
            vercelDeploymentId: created.vercelDeploymentId,
            inspectorUrl: created.inspectorUrl ?? null,
            message: "Hosting-bygget misslyckades direkt vid publiceringen.",
            source: "refresh",
          }).catch(() => {});
        }

        // Fas 0 telemetri-hygien: stämpla deploy-utfallet på versionens
        // senaste telemetri-rad. Best-effort — får aldrig fälla deploy.
        await recordDeployResultForVersion(versionId, `${deployTarget}:${mapped.status}`);

        devLogAppend("latest", {
          type: "site.deploy.done",
          chatId,
          versionId,
          deploymentId,
          source: "engine-postgres",
          status: mapped.status,
          readyState: created.readyState,
          projectId: engineProjectId,
          envVarCount: Object.keys(envVarsForDeploy).length,
          url: liveUrl,
          providerUrl: created.url ?? null,
          inspectorUrl: created.inspectorUrl ?? null,
        });

        return NextResponse.json({
          id: deploymentId,
          chatId,
          versionId,
          status: mapped.status,
          vercelDeploymentId: created.vercelDeploymentId,
          vercelProjectId: effectiveProjectId,
          url: liveUrl,
          providerUrl: created.url,
          brandedDomain: brandedDomainVerifiedAt ? publishedIdentity.brandedDomain : null,
          inspectorUrl: created.inspectorUrl,
          readyState: created.readyState,
          projectId: engineProjectId,
          envVarCount: Object.keys(envVarsForDeploy).length,
          fixesApplied,
          preDeployWarnings: warnings,
          envWarnings,
          domainWarnings,
          envSyncWarnings,
          deployReadiness,
          imageStrategyRequested: imageStrategy ?? null,
          imageStrategyUsed: imageAssets.strategyUsed,
          imageAssetsSummary: imageAssets.summary,
          imageAssetsWarnings: imageAssets.warnings,
          seo: seoApplyResult.applied
            ? {
                applied: true,
                siteUrl: seoApplyResult.siteUrl,
                source: seoApplyResult.source,
                injected: seoApplyResult.injected,
                enriched: seoApplyResult.enriched,
              }
            : { applied: false },
          // The full audit → improve → re-audit story, so the UI can show what
          // was reviewed and what actually changed rather than a bare boolean.
          seoReport: seoPass ? toSeoReportPayload(seoPass.report) : null,
        });
      } catch (deployErr) {
        // Pengaväg: vi debiterade före Vercel-anropet — refundera BARA om
        // leveransen aldrig blev live (annars behåller användaren en live deploy
        // och får krediterna tillbaka). Refunden körs FÖRE alla best-effort
        // status-/telemetri-skrivningar (Codex P1): om en sådan skrivning
        // kastar får den aldrig hoppa över refunden — då vore användaren
        // debiterad för en deploy som aldrig nådde Vercel.
        if (creditCharged && !deploymentDelivered && creditCheck) {
          try {
            await creditCheck.refund();
          } catch (refundErr) {
            console.error("[credits] Failed to refund deploy after deploy error:", refundErr);
          }
        }
        // Best-effort status-skrivning — får varken maskera deploy-felet
        // eller (ovan) blockera refunden.
        try {
          await updateDeploymentStatus(deploymentId, "error");
        } catch (statusErr) {
          console.error("[deploy] Failed to mark deployment as error:", statusErr);
        }
        // Fas 0 telemetri-hygien: registrera deploy-fel på versionens
        // telemetri-rad innan felet bubblar upp (best-effort, sväljer internt).
        await recordDeployResultForVersion(versionId, `${deployTarget}:error`);
        throw deployErr;
      }
    } catch (err) {
      console.error("Deployment error:", err);
      const classified = classifyDeployError(err);
      devLogAppend("latest", {
        type: "site.deploy.error",
        message: classified.message,
        source: classified.source,
      });
      return NextResponse.json(
        { error: classified.message, source: classified.source },
        { status: 500 },
      );
    }
  });
}
