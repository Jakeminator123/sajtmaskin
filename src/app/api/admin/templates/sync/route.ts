import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { TEST_USER_EMAIL } from "@/lib/db/services";

type TriggerBody = {
  includeEmbeddings?: boolean;
};

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  return Boolean(user?.email && user.email === TEST_USER_EMAIL);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as TriggerBody | null;

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

  const workflowFile = readEnv("TEMPLATE_SYNC_WORKFLOW_FILE") || "weekly-template-sync.yml";
  const ref = readEnv("TEMPLATE_SYNC_REF") || "main";

  const includeEmbeddings =
    body?.includeEmbeddings ??
    isTruthy(readEnv("TEMPLATE_SYNC_INCLUDE_EMBEDDINGS") || "true");

  if (!token || !owner || !repo) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Missing template sync env vars. Set TEMPLATE_SYNC_GITHUB_TOKEN, TEMPLATE_SYNC_REPO_OWNER and TEMPLATE_SYNC_REPO_NAME.",
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
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
          ref,
          inputs: {
            include_embeddings: includeEmbeddings ? "true" : "false",
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
      workflowFile,
      ref,
      includeEmbeddings,
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
