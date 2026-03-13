import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";

type TriggerBody = {
  includeEmbeddings?: boolean;
};

type TemplateSyncConfig = {
  token?: string;
  owner?: string;
  repo?: string;
  workflowFile: string;
  ref: string;
  includeEmbeddings: boolean;
  missingRequiredKeys: string[];
  configured: boolean;
};

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getTemplateSyncConfig(
  includeEmbeddingsOverride?: boolean,
): TemplateSyncConfig {
  const token =
    readEnv("TEMPLATE_SYNC_GITHUB_TOKEN") ||
    readEnv("GITHUB_WORKFLOW_TOKEN") ||
    readEnv("GITHUB_TOKEN");

  const owner =
    readEnv("TEMPLATE_SYNC_REPO_OWNER") ||
    readEnv("GITHUB_REPOSITORY_OWNER") ||
    readEnv("GITHUB_REPO_OWNER");

  const repo =
    readEnv("TEMPLATE_SYNC_REPO_NAME") ||
    readEnv("GITHUB_REPO_NAME") ||
    readEnv("GITHUB_REPOSITORY")?.split("/")[1];

  const workflowFile =
    readEnv("TEMPLATE_SYNC_WORKFLOW_FILE") || "weekly-template-sync.yml";
  const ref = readEnv("TEMPLATE_SYNC_REF") || "main";

  const includeEmbeddings =
    includeEmbeddingsOverride ??
    isTruthy(readEnv("TEMPLATE_SYNC_INCLUDE_EMBEDDINGS") || "false");

  const missingRequiredKeys: string[] = [];
  if (!token) missingRequiredKeys.push("TEMPLATE_SYNC_GITHUB_TOKEN");
  if (!owner) missingRequiredKeys.push("TEMPLATE_SYNC_REPO_OWNER");
  if (!repo) missingRequiredKeys.push("TEMPLATE_SYNC_REPO_NAME");

  return {
    token,
    owner,
    repo,
    workflowFile,
    ref,
    includeEmbeddings,
    missingRequiredKeys,
    configured: missingRequiredKeys.length === 0,
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  const config = getTemplateSyncConfig();

  return NextResponse.json({
    success: true,
    configured: config.configured,
    missingRequiredKeys: config.missingRequiredKeys,
    workflowFile: config.workflowFile,
    ref: config.ref,
    includeEmbeddingsDefault: config.includeEmbeddings,
    repository:
      config.owner && config.repo ? `${config.owner}/${config.repo}` : null,
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await req.json().catch(() => null)) as TriggerBody | null;

  const config = getTemplateSyncConfig(body?.includeEmbeddings);

  if (!config.configured) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Missing template sync env vars. Set TEMPLATE_SYNC_GITHUB_TOKEN, TEMPLATE_SYNC_REPO_OWNER and TEMPLATE_SYNC_REPO_NAME.",
        missingRequiredKeys: config.missingRequiredKeys,
      },
      { status: 503 },
    );
  }

  const owner = config.owner as string;
  const repo = config.repo as string;
  const token = config.token as string;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(config.workflowFile)}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "sajtmaskin-admin-template-sync",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: config.ref,
          inputs: {
            include_embeddings: config.includeEmbeddings ? "true" : "false",
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          error: `GitHub workflow dispatch failed (${response.status})`,
          details: errorText || undefined,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Template-sync workflow triggered. Check GitHub Actions for progress and commit result.",
      workflowFile: config.workflowFile,
      ref: config.ref,
      includeEmbeddings: config.includeEmbeddings,
    });
  } catch (error) {
    console.error("[API/admin/templates/sync] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
