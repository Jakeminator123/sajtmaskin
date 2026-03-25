import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { withRateLimit } from "@/lib/rateLimit";
import { createDeploymentRecord, updateDeploymentStatus } from "@/lib/deployment";
import { materializeImagesInTextFiles, type ImageAssetStrategy } from "@/lib/imageAssets";
import {
  SHADCN_BASELINE_PACKAGES,
  collectExternalPackageNames,
  ensureDependenciesInPackageJson,
  getDeployVersionMap,
} from "@/lib/deploy/dependency-utils";
import {
  createVercelDeployment,
  getVercelDeployment,
  mapVercelReadyStateToStatus,
  sanitizeVercelProjectName,
  syncEnvVarsToVercelProject,
  toVercelFilesFromTextFiles,
} from "@/lib/vercelDeploy";
import {
  getChatByIdForRequest,
  getChatByV0ChatIdForRequest,
  getProjectByIdForRequest,
} from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { devLogAppend } from "@/lib/logging/devLog";
import { prepareCredits } from "@/lib/credits/server";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { getChat, getVersionById } from "@/lib/db/chat-repository-pg";
import { buildDeployReadiness } from "@/lib/deploy/deploy-readiness";
import {
  resolveProjectEnv,
  resolveEnvRequirementsFromVersionFiles,
} from "@/lib/project-env-resolver";

export const runtime = "nodejs";

type PreDeployDiagnostics = {
  files: Array<{ name: string; content: string }>;
  fixesApplied: string[];
  warnings: string[];
};

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
    };
  }
  return applyPreDeployFixes(files);
}

function applyPreDeployFixes(
  files: Array<{ name: string; content: string }>,
): PreDeployDiagnostics {
  const fixesApplied: string[] = [];
  const warnings: string[] = [];
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
        dev: "next dev",
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
      console.warn("[deploy] Failed to patch package.json:", error);
    }
  }

  return { files: nextFiles, fixesApplied, warnings };
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

      const engineVersion = await getVersionById(versionId);
      if (!engineVersion) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }
      if (engineVersion.chat_id !== chatId) {
        return NextResponse.json({ error: "Version does not belong to chat" }, { status: 404 });
      }
      const [engineChat, codeFiles] = await Promise.all([
        getChat(engineVersion.chat_id),
        getVersionFiles(versionId),
      ]);
      if (!engineChat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      const requestedProjectId = projectId?.trim() || null;
      if (requestedProjectId && engineChat.project_id && requestedProjectId !== engineChat.project_id) {
        return NextResponse.json(
          { error: "Project does not match chat ownership" },
          { status: 409 },
        );
      }
      const engineProjectId = requestedProjectId || engineChat.project_id || null;
      if (!engineProjectId) {
        return NextResponse.json(
          { error: "Chat is not linked to a project" },
          { status: 403 },
        );
      }
      const ownedProject = await getProjectByIdForRequest(req, engineProjectId);
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
      if (!codeFiles || codeFiles.length === 0) {
        return NextResponse.json(
          { error: "No files found for this version" },
          { status: 404 },
        );
      }

      const textFiles = codeFiles.map((f) => ({ name: f.path, content: f.content }));

      const projectEnv = await resolveProjectEnv(engineProjectId ?? null);
      const { files: fixedFiles, fixesApplied, warnings } = runPreDeployFixPipeline(
        textFiles,
        skipPreDeployAutoFix,
      );
      const envRequirements = resolveEnvRequirementsFromVersionFiles(
        fixedFiles.map((f) => ({ path: f.name, content: f.content })),
        projectEnv,
      );
      const deployReadiness = buildDeployReadiness({
        missingEnvKeys: envRequirements.missingEnvKeys,
        preDeployWarnings: warnings,
      });

      if (precheckOnly) {
        return NextResponse.json({
          precheckOnly: true,
          chatId,
          versionId,
          projectId: engineProjectId,
          deployReadiness,
          fixesApplied,
          preDeployWarnings: warnings,
          fileCount: fixedFiles.length,
        });
      }

      if (envRequirements.missingEnvKeys.length > 0) {
        return NextResponse.json(
          {
            error:
              "Saknade miljövariabler måste konfigureras på projektet innan deploy (samma krav som i publiceringskollen).",
            code: "DEPLOY_MISSING_ENV",
            deployReadiness,
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

      try {
        const vercelProjectName = sanitizeVercelProjectName(
          projectName || `sajtmaskin-${chatId}`,
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

        const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
        const imageAssets = await materializeImagesInTextFiles({
            files: fixedFiles,
            strategy: resolvedImageStrategy,
            blobToken,
          namespace: { chatId, versionId },
        });

        if (imageAssets.warnings.length > 0) {
          console.info("[deploy] image assets warnings:", imageAssets.warnings.slice(0, 5));
        }

        const vercelFiles = toVercelFilesFromTextFiles(imageAssets.files);

        const created = await createVercelDeployment({
            projectName: vercelProjectName,
            target: deployTarget,
            files: vercelFiles,
          envVars: envVarsForDeploy,
        });

        if (created.vercelProjectId) {
          const envSync = await syncEnvVarsToVercelProject(created.vercelProjectId, envVarsForDeploy);
          if (envSync.errors.length > 0) {
            console.warn("[deploy] env var project sync errors:", envSync.errors);
          }
        }

        const mapped = mapVercelReadyStateToStatus(created.readyState);
        await updateDeploymentStatus(deploymentId, mapped.status, {
            vercelDeploymentId: created.vercelDeploymentId,
            vercelProjectId: created.vercelProjectId ?? undefined,
            url: created.url ?? undefined,
          inspectorUrl: created.inspectorUrl ?? undefined,
        });

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
            url: created.url ?? null,
          inspectorUrl: created.inspectorUrl ?? null,
        });

        try {
          if (creditCheck) {
            await creditCheck.commit();
          }
        } catch (error) {
          console.error("[credits] Failed to charge deploy:", error);
        }

        return NextResponse.json({
            id: deploymentId,
            chatId,
            versionId,
            status: mapped.status,
            vercelDeploymentId: created.vercelDeploymentId,
            vercelProjectId: created.vercelProjectId,
            url: created.url,
            inspectorUrl: created.inspectorUrl,
            readyState: created.readyState,
            projectId: engineProjectId,
            envVarCount: Object.keys(envVarsForDeploy).length,
            fixesApplied,
            preDeployWarnings: warnings,
            deployReadiness,
            imageStrategyRequested: imageStrategy ?? null,
            imageStrategyUsed: imageAssets.strategyUsed,
          imageAssetsSummary: imageAssets.summary,
          imageAssetsWarnings: imageAssets.warnings,
        });
      } catch (deployErr) {
        await updateDeploymentStatus(deploymentId, "error");
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
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      return NextResponse.json({ error: "chatId query parameter is required" }, { status: 400 });
    }

    let chat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!chat) chat = await getChatByIdForRequest(req, chatId);

    if (!chat) {
      return NextResponse.json({ deployments: [] });
    }

    const internalChatId = chat.id;

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

        await updateDeploymentStatus(latestRefreshCandidate.id, mapped.status, {
          url: vercel.url ?? undefined,
          inspectorUrl: vercel.inspectorUrl ?? undefined,
          vercelProjectId: vercel.vercelProjectId ?? undefined,
        });

        refreshedById.set(latestRefreshCandidate.id, {
          status: mapped.status,
          url: vercel.url ?? latestRefreshCandidate.url ?? null,
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
          url: refreshed?.url ?? d.url,
          inspectorUrl: refreshed?.inspectorUrl ?? d.inspectorUrl,
          vercelDeploymentId: d.vercelDeploymentId,
          vercelProjectId: refreshed?.vercelProjectId ?? d.vercelProjectId,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        };
      }),
    });
  } catch (err) {
    console.error("Get deployments error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
