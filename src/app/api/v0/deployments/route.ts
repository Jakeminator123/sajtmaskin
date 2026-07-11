import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { withRateLimit } from "@/lib/rateLimit";
import {
  createDeploymentRecord,
  getLinkedDomainForChat,
  getLatestVercelProjectIdForChat,
  setLatestDeploymentLiveUrlForChat,
  updateDeploymentStatus,
} from "@/lib/deployment";
import { materializeImagesInTextFiles, type ImageAssetStrategy } from "@/lib/imageAssets";
import {
  SHADCN_BASELINE_PACKAGES,
  collectExternalPackageNames,
  ensureDependenciesInPackageJson,
  getDeployVersionMap,
} from "@/lib/deploy/dependency-utils";
import {
  createVercelDeployment,
  checkVercelProjectDomain,
  buildGeneratedVercelProjectName,
  ensureVercelProject,
  getVercelDeployment,
  mapVercelReadyStateToStatus,
  ensureVercelProjectDomain,
  sanitizeVercelProjectName,
  syncEnvVarsToVercelProject,
  toVercelFilesFromTextFiles,
} from "@/lib/vercelDeploy";
import {
  getAppProjectByIdForRequest,
  getChatByIdForRequest,
  getChatByV0ChatIdForRequest,
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { devLogAppend } from "@/lib/logging/devLog";
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
import { readAllowPlaceholdersInF3 } from "@/lib/project-env-vars";
import { resolveSelectedDossiersWithVersionPresence } from "@/lib/gen/dossiers/version-presence";
import {
  clearProjectBrandedDomainVerification,
  clearProjectCustomDomainVerification,
  ensureProjectPublishedIdentity,
  getProjectById,
  getProjectData,
  markProjectBrandedDomainVerified,
  setProjectVercelLink,
} from "@/lib/db/services/projects";
import {
  readSeoPreferencesFromMeta,
  seoPreferencesSchema,
} from "@/lib/projects/preferences-schema";
import { resolveDeploySeoOptions } from "./resolve-seo";
import { applySeoToProjectFiles } from "@/lib/gen/scaffolds/seo-defaults";
import { isGeneratedEnvLocalPath } from "@/lib/gen/export/strip-env-local-for-zip";
import { buildEnvDegradationWarnings } from "./env-degradation-warnings";
import { getBrandedLiveSiteDomain, resolveLiveUrl } from "@/lib/live-site-url";

export const runtime = "nodejs";

type PreDeployDiagnostics = {
  files: Array<{ name: string; content: string }>;
  fixesApplied: string[];
  warnings: string[];
  /** Filvägar som preflight flaggade som ogiltiga / ej kunde patchas (tunn kontrakt mot UI). */
  invalidFiles: string[];
};

/**
 * K-007 (2026-03-26): pre-deploy auto-fix stays **enabled by default**; only skip when
 * body `skipAutoFix` or deploy-disable env vars are set. See `docs/architecture/llm-pipeline.md` (detalj: arkiv `deploy-precheck.md`).
 */
function shouldSkipPreDeployAutoFix(bodySkipAutoFix?: boolean): boolean {
  if (bodySkipAutoFix === true) return true;
  return (
    process.env.SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX === "1" ||
    process.env.DEPLOY_DISABLE_AUTO_FIX === "1"
  );
}

function runPreDeployFixPipeline(
  files: Array<{ name: string; content: string }>,
  skipAutoFix: boolean,
): PreDeployDiagnostics {
  if (skipAutoFix) {
    return {
      files: files.map((f) => ({ ...f })),
      fixesApplied: [
        "Pre-deploy auto-fix skipped (skipAutoFix in body or SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX=1 / DEPLOY_DISABLE_AUTO_FIX=1)",
      ],
      warnings: [],
      invalidFiles: [],
    };
  }
  return applyPreDeployFixes(files);
}

function applyPreDeployFixes(
  files: Array<{ name: string; content: string }>,
): PreDeployDiagnostics {
  const fixesApplied: string[] = [];
  const warnings: string[] = [];
  const invalidFiles: string[] = [];
  const lockfileNames = new Set(["pnpm-lock.yaml", "pnpm-lock.yml", "yarn.lock"]);
  const removedLockfiles = new Set<string>();
  const nextFiles = files
    .filter((file) => {
      const baseName = file.name.split("/").pop()?.toLowerCase() || "";
      if (lockfileNames.has(baseName)) {
        removedLockfiles.add(baseName);
        return false;
      }
      return true;
    })
    .map((f) => ({ ...f }));
  if (removedLockfiles.size > 0) {
    fixesApplied.push(
      `Removed lockfiles to prefer npm: ${Array.from(removedLockfiles).join(", ")}`,
    );
  }

  const versionMap = getDeployVersionMap();

  const buildBasePackageJson = () => {
    const missing: string[] = [];
    const dependencies: Record<string, string> = {};
    const devDependencies: Record<string, string> = {};
    const addVersion = (target: Record<string, string>, pkg: string) => {
      const version = versionMap[pkg];
      if (version) {
        target[pkg] = version;
      } else {
        missing.push(pkg);
      }
    };
    ["next", "react", "react-dom"].forEach((pkg) => addVersion(dependencies, pkg));
    [
      "typescript",
      "@types/react",
      "@types/react-dom",
      "@types/node",
      "tailwindcss",
      "postcss",
      "@tailwindcss/postcss",
    ].forEach((pkg) => addVersion(devDependencies, pkg));
    const base = {
      name: "generated-site",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev --webpack",
        build: "next build",
        start: "next start",
      },
      dependencies,
      devDependencies,
    };
    return {
      content: `${JSON.stringify(base, null, 2)}\n`,
      missing,
    };
  };

  const removeBrokenUtilityBlocks = (content: string) => {
    if (!content.includes("@utility")) {
      return { content, removed: 0 };
    }

    const marker = "@utility";
    let updated = content;
    let removed = 0;
    let index = 0;

    while (index < updated.length) {
      const start = updated.indexOf(marker, index);
      if (start === -1) break;

      const lineEnd = updated.indexOf("\n", start);
      const head = updated.slice(start, lineEnd === -1 ? updated.length : lineEnd);
      if (!head.includes("slide-in-from-top-")) {
        index = start + marker.length;
        continue;
      }

      const braceIndex = updated.indexOf("{", start);
      if (braceIndex === -1) {
        index = start + marker.length;
        continue;
      }

      let depth = 1;
      let cursor = braceIndex + 1;
      while (cursor < updated.length) {
        const ch = updated[cursor];
        if (ch === "{") depth += 1;
        if (ch === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        cursor += 1;
      }

      if (depth === 0) {
        index = cursor + 1;
        continue;
      }

      // Missing closing brace: remove the broken utility block (best-effort).
      const nextUtility = updated.indexOf(marker, start + marker.length);
      const cutEnd = nextUtility === -1 ? updated.length : nextUtility;
      updated = `${updated.slice(0, start)}${updated.slice(cutEnd)}`;
      removed += 1;
      index = start;
    }

    return { content: updated, removed };
  };

  const needsClientDirective = (content: string): boolean => {
    if (!content) return false;
    const usesHooks =
      /from\s+["']react["']/.test(content) &&
      /\buse(State|Effect|Memo|Callback|Ref|LayoutEffect|Reducer)\b/.test(content);
    return usesHooks;
  };

  const hasUseClient = (content: string): boolean => /^\s*["']use client["'];/m.test(content);

  const hasMetadataExport = (content: string): boolean =>
    /\bexport\s+const\s+metadata\b/.test(content) || /\bgenerateMetadata\b/.test(content);

  const ensureUseClient = (file: { name: string; content: string }, reason: string) => {
    if (hasUseClient(file.content)) return;
    if (hasMetadataExport(file.content)) {
      warnings.push(`Cannot mark ${file.name} as client (${reason}) because it exports metadata.`);
      return;
    }
    file.content = `"use client";\n\n${file.content}`;
    fixesApplied.push(`Marked ${file.name} as client (${reason})`);
  };

  for (const f of nextFiles) {
    if (typeof f.content !== "string") continue;

    const isAppFile = f.name === "app/page.tsx" || f.name.startsWith("app/");

    if (isAppFile) {
      const hasLucideImport = /from\s+["']lucide-react["']/.test(f.content);
      const hasIconComponentProp = /\bicon\s*:\s*[A-Z][A-Za-z0-9_]*/.test(f.content);
      if (hasLucideImport && hasIconComponentProp) {
        ensureUseClient(f, "icon component props in app file");
      } else if (needsClientDirective(f.content)) {
        ensureUseClient(f, "react hooks in app file");
      }
    }

    if (f.content.includes("Instrument_Serif") && f.content.includes("weight")) {
      const before = f.content;

      let updated = before
        .replace(/weight:\s*\[\s*"400"\s*,\s*"600"\s*\]/g, 'weight: ["400"]')
        .replace(/weight:\s*\[\s*'400'\s*,\s*'600'\s*\]/g, "weight: ['400']");

      if (updated === before) {
        updated = updated.replace(
          /(Instrument_Serif\(\{[\s\S]*?weight:\s*)\[([^\]]*)\]/g,
          (match, prefix, arr) => {
            const parts = String(arr)
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);

            const filtered = parts.filter((p) => !/^(['"])600\1$/.test(p));
            if (filtered.length === parts.length) return match;
            const nextArr = `[${filtered.join(", ")}]`;
            return `${prefix}${nextArr}`;
          },
        );
      }

      if (updated !== before) {
        f.content = updated;
        fixesApplied.push(`Fixed Instrument_Serif invalid weight in ${f.name}`);
      }
    }

    if (f.name.endsWith(".css") && f.content.includes("@utility")) {
      const result = removeBrokenUtilityBlocks(f.content);
      if (result.removed > 0 && result.content !== f.content) {
        f.content = result.content;
        fixesApplied.push(
          `Removed ${result.removed} broken @utility block${result.removed > 1 ? "s" : ""} in ${f.name}`,
        );
      }
    }
  }

  const requiredPackages = new Set<string>(SHADCN_BASELINE_PACKAGES);
  const importedPackages = collectExternalPackageNames(nextFiles);
  importedPackages.forEach((pkg) => requiredPackages.add(pkg));

  const normalizePackageName = (name: string) => name.replace(/^\/+/, "");
  let packageFile = nextFiles.find((f) => normalizePackageName(f.name) === "package.json");
  if (!packageFile) {
    const base = buildBasePackageJson();
    if (base.missing.length > 0) {
      warnings.push(
        `Missing versions for base deps in package.json: ${base.missing.join(", ")}`,
      );
    }
    packageFile = { name: "package.json", content: base.content };
    nextFiles.push(packageFile);
    fixesApplied.push("Added package.json scaffold");
  }

  if (packageFile?.content) {
    try {
      const result = ensureDependenciesInPackageJson({
        packageJsonContent: packageFile.content,
        requiredPackages,
        versionMap,
      });
      packageFile.content = result.content;
      if (result.added.length > 0) {
        fixesApplied.push(`Added missing dependencies: ${result.added.join(", ")}`);
      }
      if (result.missing.length > 0) {
        warnings.push(
          `Missing versions for dependencies: ${result.missing.slice(0, 10).join(", ")}`,
        );
      }
    } catch (error) {
      warnings.push("Failed to update package.json dependencies (invalid JSON)");
      invalidFiles.push("package.json");
      console.warn("[deploy] Failed to patch package.json:", error);
    }
  }

  return { files: nextFiles, fixesApplied, warnings, invalidFiles };
}

type DeployErrorSource = "internal" | "upstream" | "unknown";

function classifyDeployError(err: unknown): { source: DeployErrorSource; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("chat not found") ||
    normalized.includes("version not found") ||
    normalized.includes("validation failed") ||
    normalized.includes("no files returned from v0")
  ) {
    return { source: "internal", message };
  }

  if (
    normalized.includes("vercel") ||
    normalized.includes("v0") ||
    normalized.includes("rate limit") ||
    normalized.includes("timeout") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return { source: "upstream", message };
  }

  return { source: "unknown", message };
}

const createDeploymentSchema = z.object({
  chatId: z.string().min(1, "chatId is required"),
  versionId: z.string().min(1, "versionId is required"),
  projectName: z.string().optional(),
  target: z.enum(["production", "preview"]).optional(),
  imageStrategy: z.enum(["external", "blob"]).optional(),
  projectId: z.string().optional(),
  /** Kör samma preflight som deploy (fixar + env-krav) utan Vercel-anrop, credits eller deployment-rad. */
  precheckOnly: z.boolean().optional(),
  /** Felsökning: hoppa över applyPreDeployFixes; env-krav beräknas på rå snapshot. */
  skipAutoFix: z.boolean().optional(),
  /**
   * SEO opt-in for this deploy (PR-B / "Bygg-dialog → SEO-paket").
   * Body-override wins over `project_data.meta.seo`. Same validation as
   * `PATCH /api/projects/[id]/preferences` (https-URL, locale-format,
   * `optIn=true` requires siteUrl).
   *
   * Omitting `seo` falls back to persisted `meta.seo` from the project.
   * The site URL is resolved from the project's verified custom domain or
   * branded standard domain; no process-global SEO domain is used.
   */
  seo: seoPreferencesSchema.optional(),
});

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
      if (
        !releaseGate.allowed &&
        (releaseGate.code === "DEPLOY_VERSION_FAILED" || !precheckOnly)
      ) {
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
        return NextResponse.json(
          { error: "Chat is not linked to a project" },
          { status: 403 },
        );
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
      // Publicera-lås (Ö2 / A2): en kopplad custom-domän sitter på Vercel-
      // PROJEKTET (namn-baserat), inte på en enskild deployment. Om användaren
      // publicerar om med ett NYTT projectName skulle vi rikta mot ett annat
      // Vercel-projekt och lämna domänen kvar (orphan) på det gamla → domänen
      // pekar på gammal sajt. Därför: så länge en domän är kopplad för chatten
      // är projektnamnet LÅST. Vi läser DB (senaste `deployments.domain`) i
      // stället för att slå mot Vercel-API:t i deploy-hot-path:en. `precheckOnly`
      // rapporterar låset i `projectNameLock` i stället för att kasta (samma
      // mönster som A1:s `releaseGate`).
      const linkedDomain =
        (ownedProject.custom_domain_verified_at
          ? ownedProject.custom_domain?.trim()
          : null) ||
        (ownedProject.branded_domain_verified_at
          ? ownedProject.branded_domain?.trim()
          : null) ||
        (await getLinkedDomainForChat(chatId).catch(() => null));
      // Mirror the actual deployment target exactly. Once a provider project
      // name is persisted, display-name edits cannot retarget hosting. Legacy
      // rows derive the same collision-safe name as the deploy path.
      const currentVercelProjectName = sanitizeVercelProjectName(
        (typeof ownedProject.vercel_project_name === "string"
          ? ownedProject.vercel_project_name.trim()
          : "") ||
          buildGeneratedVercelProjectName(
            ownedProject.name || `sajtmaskin-${chatId}`,
            engineProjectId,
          ),
      );
      const requestedVercelProjectName =
        typeof projectName === "string" && projectName.trim().length > 0
          ? ownedProject.vercel_project_name
            ? sanitizeVercelProjectName(projectName)
            : buildGeneratedVercelProjectName(
                projectName,
                engineProjectId,
              )
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
        return NextResponse.json(
          { error: "No files found for this version" },
          { status: 404 },
        );
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

      const { files: fixedFiles, fixesApplied, warnings, invalidFiles } = runPreDeployFixPipeline(
        textFiles,
        skipPreDeployAutoFix,
      );
      // Align with the readiness route (`readiness/route.ts`): pass the
      // version's ACTUAL lifecycle stage + selected dossiers so deploy counts
      // env requirements the same way readiness does. Without this, deploy
      // always evaluated F2 (`design`) env logic — for an F3 (`integrations`)
      // project that meant tier-3 placeholder-covered keys were silently
      // treated as "covered" instead of counted toward the real requirement,
      // so deploy and readiness could disagree on the same version.
      const lifecycleStage =
        typeof engineVersion.lifecycle_stage === "string" ? engineVersion.lifecycle_stage : "design";
      const envGateActive = lifecycleStage === "integrations";
      const allowPlaceholdersInF3 = envGateActive
        ? await readAllowPlaceholdersInF3(engineProjectId)
        : false;
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
      // - F2 (`design`): keep the legacy `missingEnvKeys` backstop (truly
      //   absent keys, no placeholder). In design, `buildBlockingKeys` also
      //   contains tier-3-placeholder-covered keys (allowPlaceholdersInF3 is
      //   always false there), so gating F2 on it would block demo publishes
      //   that must stay publishable (env-flow-f2-mute; bugbot high på #461).
      //
      // `missingEnvKeys` is still surfaced in `deployReadiness` for
      // observability in both stages.
      const envBlockingKeys = envGateActive
        ? envRequirements.buildBlockingKeys
        : envRequirements.missingEnvKeys;
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

        // Reuse the SAME Vercel project across re-publishes: prefer an explicit
        // body name, then the name persisted from a previous publish, then the
        // per-chat fallback. Targeting stays name-based (no new API params).
        const brandedRolloutEnabled = Boolean(getBrandedLiveSiteDomain());
        const preferredProjectName =
          projectName || ownedProject.name || `sajtmaskin-${chatId}`;
        const vercelProjectName = sanitizeVercelProjectName(
          ownedProject.vercel_project_name ||
            buildGeneratedVercelProjectName(
              preferredProjectName,
              engineProjectId,
            ),
        );
        const existingVercelProjectId =
          ownedProject.vercel_project_id?.trim() ||
          (await getLatestVercelProjectIdForChat(chatId)) ||
          null;
        const currentCustomDomain = ownedProject.custom_domain?.trim() || null;
        let currentCustomDomainVerifiedAt =
          ownedProject.custom_domain_verified_at ?? null;
        if (
          currentCustomDomain &&
          currentCustomDomainVerifiedAt &&
          existingVercelProjectId
        ) {
          const customDomainValid = await checkVercelProjectDomain(
            existingVercelProjectId,
            currentCustomDomain,
          );
          if (customDomainValid === false) {
            await clearProjectCustomDomainVerification(
              engineProjectId,
              currentCustomDomain,
            );
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
              const marked = await markProjectBrandedDomainVerified(
                engineProjectId,
                alias.name,
              );
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
        const seoApplyResult = resolvedSeoOptions
          ? applySeoToProjectFiles(fixedFiles, resolvedSeoOptions)
          : { applied: false as const, files: fixedFiles, source: "explicit-noop" as const, siteUrl: null, injected: [] as string[], enriched: [] as string[] };
        if (seoApplyResult.applied) {
          console.info("[deploy] SEO injected", {
            siteUrl: seoApplyResult.siteUrl,
            source: seoApplyResult.source,
            injected: seoApplyResult.injected,
            enriched: seoApplyResult.enriched,
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
          });
        }
        const filesForDeploy = seoApplyResult.applied ? seoApplyResult.files : fixedFiles;

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
          created.vercelProjectId ??
          ensuredProject?.id ??
          ownedProject.vercel_project_id ??
          null;

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

export async function GET(req: Request) {
  return withRateLimit(req, "v0:deployments-list", async () => {
    try {
      const { searchParams } = new URL(req.url);
      const chatId = searchParams.get("chatId");

      if (!chatId) {
        return NextResponse.json({ error: "chatId query parameter is required" }, { status: 400 });
      }

      // Own-engine chats are the primary path: publish writes deployment rows
      // keyed by the engine chat id (the id the builder passes). Resolve the
      // engine chat first (tenant-guarded), and fall back to the legacy chat
      // lookup for older v0-era chats so both keep working after a reload.
      let internalChatId: string | null = null;
      let appProjectId: string | null = null;
      const engineChat = await getEngineChatByIdForRequest(req, chatId);
      if (engineChat) {
        internalChatId = engineChat.id;
        appProjectId =
          typeof engineChat.project_id === "string" && engineChat.project_id.trim()
            ? engineChat.project_id.trim()
            : null;
      } else {
        let chat = await getChatByV0ChatIdForRequest(req, chatId);
        if (!chat) chat = await getChatByIdForRequest(req, chatId);
        if (chat) internalChatId = chat.id;
      }

      // Contract with the builder UI: top-level `project` carries the persisted
      // Vercel project link (null-safe; legacy chats have no app_projects row).
      const appProject = appProjectId
        ? await getProjectById(appProjectId).catch(() => null)
        : null;
      let brandedDomainVerifiedAt =
        appProject?.branded_domain_verified_at ?? null;
      let customDomainVerifiedAt =
        appProject?.custom_domain_verified_at ?? null;
      const brandedDomainCheckedAt =
        appProject?.branded_domain_checked_at ?? null;
      const brandedDomainCheckedAtMs = brandedDomainCheckedAt
        ? new Date(brandedDomainCheckedAt).getTime()
        : Number.NaN;
      const shouldRecheckBrandedDomain =
        !Number.isFinite(brandedDomainCheckedAtMs) ||
        Date.now() - brandedDomainCheckedAtMs >= 5 * 60 * 1000;
      if (
        appProjectId &&
        appProject?.custom_domain &&
        customDomainVerifiedAt &&
        appProject.vercel_project_id
      ) {
        const configured = await checkVercelProjectDomain(
          appProject.vercel_project_id,
          appProject.custom_domain,
        );
        if (configured === false) {
          await clearProjectCustomDomainVerification(
            appProjectId,
            appProject.custom_domain,
          );
          customDomainVerifiedAt = null;
        }
      }
      if (
        getBrandedLiveSiteDomain() &&
        appProjectId &&
        appProject?.branded_domain &&
        !brandedDomainVerifiedAt &&
        shouldRecheckBrandedDomain &&
        appProject.vercel_project_id
      ) {
        const configured = await checkVercelProjectDomain(
          appProject.vercel_project_id,
          appProject.branded_domain,
        );
        if (configured === true) {
          const marked = await markProjectBrandedDomainVerified(
            appProjectId,
            appProject.branded_domain,
          );
          if (marked) {
            brandedDomainVerifiedAt =
              marked.branded_domain_verified_at ?? new Date();
            if (internalChatId) {
              await setLatestDeploymentLiveUrlForChat(
                internalChatId,
                appProject.branded_domain,
              );
            }
          }
        }
      }
      const project = {
        vercelProjectId: appProject?.vercel_project_id ?? null,
        vercelProjectName: appProject?.vercel_project_name ?? null,
        publishedSlug: appProject?.published_slug ?? null,
        brandedDomain: appProject?.branded_domain ?? null,
        brandedDomainVerifiedAt,
        customDomain: appProject?.custom_domain ?? null,
        customDomainVerifiedAt,
      };

      if (!internalChatId) {
        return NextResponse.json({ deployments: [], project });
      }

      const result = await db
        .select()
        .from(deployments)
        .where(eq(deployments.chatId, internalChatId))
        .orderBy(desc(deployments.createdAt));
      const refreshedById = new Map<
        string,
        {
          status: ReturnType<typeof mapVercelReadyStateToStatus>["status"];
          url: string | null;
          providerUrl: string | null;
          inspectorUrl: string | null;
          vercelProjectId: string | null;
        }
      >();

      const latestRefreshCandidate = result.find((d) => {
        const status = String(d.status || "pending");
        const isTerminal = status === "ready" || status === "error" || status === "cancelled";
        return Boolean(d.vercelDeploymentId) && !isTerminal;
      });

      if (latestRefreshCandidate?.vercelDeploymentId) {
        try {
          const vercel = await getVercelDeployment(latestRefreshCandidate.vercelDeploymentId);
          const mapped = mapVercelReadyStateToStatus(vercel.readyState);
          const refreshedLiveUrl = resolveLiveUrl({
            providerUrl:
              vercel.url ?? latestRefreshCandidate.providerUrl ?? null,
            brandedDomain: appProject?.branded_domain ?? null,
            brandedDomainVerifiedAt,
            customDomain: appProject?.custom_domain ?? null,
            customDomainVerifiedAt,
          });

          const refreshWrite = await updateDeploymentStatus(latestRefreshCandidate.id, mapped.status, {
            providerUrl: vercel.url ?? undefined,
            url: refreshedLiveUrl ?? undefined,
            inspectorUrl: vercel.inspectorUrl ?? undefined,
            vercelProjectId: vercel.vercelProjectId ?? undefined,
          });
          // BB#deploy2: vinner list-refreshen (t.ex. sidladdning) den atomiska
          // övergången till `error` före webhook/poll äger den loggen — annars
          // skulle build-felet aldrig loggas (webhook/poll ser sedan
          // transitionedToError=false).
          if (refreshWrite.transitionedToError) {
            await logDeployError({
              chatId: latestRefreshCandidate.chatId,
              versionId: latestRefreshCandidate.versionId,
              deploymentId: latestRefreshCandidate.id,
              vercelDeploymentId: latestRefreshCandidate.vercelDeploymentId,
              inspectorUrl: vercel.inspectorUrl ?? null,
              message: "Hosting-bygget misslyckades (fångat vid statusuppdatering).",
              source: "refresh",
            }).catch(() => {});
          }

          refreshedById.set(latestRefreshCandidate.id, {
            status: mapped.status,
            providerUrl: vercel.url ?? latestRefreshCandidate.providerUrl ?? null,
            url: refreshedLiveUrl ?? latestRefreshCandidate.url ?? null,
            inspectorUrl: vercel.inspectorUrl ?? latestRefreshCandidate.inspectorUrl ?? null,
            vercelProjectId: vercel.vercelProjectId ?? latestRefreshCandidate.vercelProjectId ?? null,
          });
        } catch (err) {
          console.error("Failed to refresh latest deployment in list:", err);
        }
      }

      return NextResponse.json({
        deployments: result.map((d) => {
          const refreshed = refreshedById.get(d.id);
          return {
            id: d.id,
            chatId: d.chatId,
            versionId: d.versionId,
            status: refreshed?.status ?? d.status,
            url:
              refreshed?.url ??
              resolveLiveUrl({
                providerUrl: d.providerUrl,
                brandedDomain: appProject?.branded_domain ?? null,
                brandedDomainVerifiedAt,
                customDomain: appProject?.custom_domain ?? null,
                customDomainVerifiedAt,
              }) ??
              d.url,
            providerUrl: refreshed?.providerUrl ?? d.providerUrl,
            inspectorUrl: refreshed?.inspectorUrl ?? d.inspectorUrl,
            vercelDeploymentId: d.vercelDeploymentId,
            vercelProjectId: refreshed?.vercelProjectId ?? d.vercelProjectId,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        }),
        project,
      });
    } catch (err) {
      console.error("Get deployments error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
