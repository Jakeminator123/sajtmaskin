import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectById,
  getProjectData,
  getUserById,
  saveProjectFilesToDb,
  updateProject,
} from "@/lib/database";
import { saveProjectFiles, saveProjectMeta, ProjectFile } from "@/lib/redis";
import JSZip from "jszip";

/**
 * Project Takeover API
 *
 * Takes a project from v0 and stores it for editing with OpenAI Agents.
 *
 * TWO MODES:
 * 1. REDIS (default) - Simple, no GitHub required
 *    - Files stored in Redis
 *    - User can edit with AI agent
 *    - Can download as ZIP anytime
 *
 * 2. GITHUB (optional) - Full ownership
 *    - Creates repo on user's GitHub
 *    - Pushes all files
 *    - User has complete control
 *
 * Flow:
 * 1. Get project data (chatId, files)
 * 2. Extract files from project
 * 3. Store in Redis OR push to GitHub
 * 4. Update project metadata
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface GitHubCreateRepoResponse {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  default_branch: string;
  owner?: {
    login: string;
  };
}

interface TakeoverRequest {
  repoName?: string; // Optional custom repo name
  mode?: "redis" | "github"; // Storage mode (default: redis)
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    let body: TakeoverRequest = {};
    try {
      body = await request.json();
    } catch (jsonError) {
      console.warn("[Takeover] Failed to parse JSON body, using defaults:", jsonError);
      // Continue with default values
    }
    const mode = body.mode || "redis"; // Default to Redis (simple, no GitHub required)

    // Starting takeover process

    // 1. Verify user is authenticated
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att ta över projekt",
        },
        { status: 401 }
      );
    }

    // 2. Check GitHub connection ONLY if github mode is requested
    const fullUser = getUserById(user.id);
    if (mode === "github") {
      if (!fullUser?.github_token || !fullUser?.github_username) {
        return NextResponse.json(
          {
            success: false,
            error: "Du måste ansluta ditt GitHub-konto först",
            requireGitHub: true,
          },
          { status: 400 }
        );
      }
    }

    // 3. Get project and project data
    const project = getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Projektet hittades inte" },
        { status: 404 }
      );
    }

    const projectData = getProjectData(projectId);
    if (!projectData) {
      return NextResponse.json(
        { success: false, error: "Projektdata hittades inte" },
        { status: 404 }
      );
    }
    if (!projectData.chat_id) {
      return NextResponse.json(
        { success: false, error: "Projektet har ingen v0-data att ta över" },
        { status: 400 }
      );
    }

    // 4. Get files from project data

    let files: ProjectFile[] = [];

    if (projectData.files && Array.isArray(projectData.files) && projectData.files.length > 0) {
      // Using cached files from project data
      files = projectData.files
        .filter((f: unknown) => 
          f && 
          typeof f === "object" && 
          "name" in f && 
          "content" in f &&
          typeof (f as { name: unknown }).name === "string" &&
          typeof (f as { content: unknown }).content === "string"
        )
        .map((f: { name: string; content: string }) => ({
          path: f.name,
          content: f.content,
          lastModified: new Date().toISOString(),
        }));
    } else {
      return NextResponse.json(
        {
          success: false,
          error:
            "Projektet saknar fil-data. Försök generera eller förfina projektet först.",
        },
        { status: 400 }
      );
    }

    // Files retrieved successfully

    // ============ REDIS MODE (Simple, no GitHub required) ============
    if (mode === "redis") {
      // Save files to SQLite (source of truth)
      try {
        const savedCount = saveProjectFilesToDb(projectId, files);
        if (savedCount === 0) {
          return NextResponse.json(
            { success: false, error: "Kunde inte spara projektfiler till SQLite" },
            { status: 500 }
          );
        }
      } catch (saveError) {
        const errorMessage =
          saveError instanceof Error ? saveError.message : "Okänt fel";
        console.error("[Takeover] Failed to save files to SQLite:", errorMessage);
        return NextResponse.json(
          { success: false, error: `Kunde inte spara projektfiler: ${errorMessage}` },
          { status: 500 }
        );
      }

      // Best-effort cache in Redis for fast reads (short-lived)
      try {
        await saveProjectFiles(projectId, files);
      } catch (cacheError) {
        console.warn(
          "[Takeover] Saved to SQLite men kunde inte cacha i Redis:",
          cacheError
        );
      }

      // Save project metadata
      await saveProjectMeta({
        projectId,
        userId: user.id,
        name: project.name,
        takenOverAt: new Date().toISOString(),
        storageType: "sqlite",
        filesCount: files.length,
      });

      // Update project in database
      try {
        updateProject(projectId, {
          name: `${project.name} ✏️`,
          description: "Övertagen - kan redigeras med AI",
        });
      } catch (updateError) {
        // Log but don't fail - files are already saved
        console.warn("[Takeover] Failed to update project in database:", updateError);
      }

      // Project saved to Redis successfully

      return NextResponse.json({
        success: true,
        message:
          "Projektet har tagits över! Filerna är sparade i SQLite och kan redigeras med AI.",
        mode: "sqlite",
        filesCount: files.length,
        files: files.map((f) => ({ path: f.path, size: f.content.length })),
      });
    }

    // ============ GITHUB MODE (Full ownership) ============
    // Create GitHub repo
    const repoName =
      body.repoName ||
      `sajt-${project.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

    // At this point we know fullUser has github_token (checked at line ~77-87)
    if (!fullUser?.github_token || !fullUser?.github_username) {
      return NextResponse.json(
        {
          success: false,
          error: "GitHub-token saknas. Vänligen anslut ditt GitHub-konto igen.",
          requireGitHub: true,
        },
        { status: 400 }
      );
    }
    const githubToken = fullUser.github_token;
    const githubUsername = fullUser.github_username;

    const createRepoResponse = await fetch(
      "https://api.github.com/user/repos",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: repoName,
          description: `Generated by Sajtmaskin - ${project.name}`,
          private: true,
          auto_init: false, // We'll create our own initial commit
        }),
      }
    );

    if (!createRepoResponse.ok) {
      let errorData: { message?: string; errors?: unknown[] } = {};
      try {
        errorData = await createRepoResponse.json();
      } catch (jsonError) {
        console.error("[Takeover] Failed to parse GitHub error response:", jsonError);
      }
      
      console.error("[Takeover] GitHub repo creation failed:", {
        status: createRepoResponse.status,
        statusText: createRepoResponse.statusText,
        error: errorData,
      });

      // Handle specific error cases
      if (createRepoResponse.status === 422) {
        const errorMessage = errorData.message || `Ett repo med namnet "${repoName}" finns redan.`;
        return NextResponse.json(
          {
            success: false,
            error: errorMessage,
            repoNameTaken: true,
          },
          { status: 400 }
        );
      }
      
      if (createRepoResponse.status === 401 || createRepoResponse.status === 403) {
        return NextResponse.json(
          {
            success: false,
            error: "GitHub-autentisering misslyckades. Vänligen anslut ditt GitHub-konto igen.",
            requireGitHub: true,
          },
          { status: 401 }
        );
      }
      
      if (createRepoResponse.status === 429) {
        return NextResponse.json(
          {
            success: false,
            error: "GitHub rate limit nådd. Försök igen om en stund.",
          },
          { status: 429 }
        );
      }

      const errorMessage = errorData.message || "Kunde inte skapa GitHub-repo";
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: createRepoResponse.status }
      );
    }

    let repo: GitHubCreateRepoResponse;
    try {
      repo = await createRepoResponse.json();
      
      // Validate response structure
      if (!repo || !repo.full_name || !repo.name) {
        throw new Error("Invalid GitHub response structure");
      }
    } catch (jsonError) {
      const errorMsg = jsonError instanceof Error ? jsonError.message : "Okänt fel";
      console.error("[Takeover] Failed to parse GitHub repo response:", errorMsg);
      return NextResponse.json(
        { success: false, error: `Kunde inte läsa GitHub-svar: ${errorMsg}` },
        { status: 500 }
      );
    }
    
    // 7. Push all files to repo (create initial commit with all files)

    // Create blobs for all files
    const blobs: { path: string; sha: string }[] = [];

    for (const file of files) {
      const blobResponse = await fetch(
        `https://api.github.com/repos/${repo.full_name}/git/blobs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: Buffer.from(file.content).toString("base64"),
            encoding: "base64",
          }),
        }
      );

      if (!blobResponse.ok) {
        console.error("[Takeover] Failed to create blob for:", file.path);
        continue;
      }

      const blob = await blobResponse.json();
      blobs.push({ path: file.path, sha: blob.sha });
    }

    // Create tree with all blobs
    const treeResponse = await fetch(
      `https://api.github.com/repos/${repo.full_name}/git/trees`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tree: blobs.map((blob) => ({
            path: blob.path,
            mode: "100644", // Regular file
            type: "blob",
            sha: blob.sha,
          })),
        }),
      }
    );

    if (!treeResponse.ok) {
      console.error("[Takeover] Failed to create tree");
      return NextResponse.json(
        { success: false, error: "Kunde inte skapa filträd på GitHub" },
        { status: 500 }
      );
    }

    const tree = await treeResponse.json();

    // Create commit
    const commitResponse = await fetch(
      `https://api.github.com/repos/${repo.full_name}/git/commits`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Initial commit from Sajtmaskin 🚀",
          tree: tree.sha,
        }),
      }
    );

    if (!commitResponse.ok) {
      console.error("[Takeover] Failed to create commit");
      return NextResponse.json(
        { success: false, error: "Kunde inte skapa commit på GitHub" },
        { status: 500 }
      );
    }

    const commit = await commitResponse.json();

    // Update default branch to point to our commit
    const refResponse = await fetch(
      `https://api.github.com/repos/${repo.full_name}/git/refs/heads/${
        repo.default_branch || "main"
      }`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sha: commit.sha,
          force: true,
        }),
      }
    );

    // If branch doesn't exist, create it
    if (!refResponse.ok) {
      await fetch(`https://api.github.com/repos/${repo.full_name}/git/refs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: `refs/heads/${repo.default_branch || "main"}`,
          sha: commit.sha,
        }),
      });
    }

    // Files pushed successfully

    // Create GitHub-style project ID for URL routing (owner_repo format)
    const githubProjectId = `${githubUsername}_${repo.name}`;

    // Save to Redis for agent editing (GitHub is the source of truth, Redis is cache)
    // Save with BOTH database ID and GitHub-style ID for flexibility
    await saveProjectFiles(projectId, files);
    await saveProjectFiles(githubProjectId, files); // Also save with GitHub-style ID

    // Save project metadata with database ID
    await saveProjectMeta({
      projectId,
      userId: user.id,
      name: project.name,
      takenOverAt: new Date().toISOString(),
      storageType: "github",
      githubRepo: repo.name,
      githubOwner: githubUsername,
      filesCount: files.length,
    });

    // Also save metadata with GitHub-style ID (for /project/[repo]?owner=user routing)
    await saveProjectMeta({
      projectId: githubProjectId,
      userId: user.id,
      name: project.name,
      takenOverAt: new Date().toISOString(),
      storageType: "github",
      githubRepo: repo.name,
      githubOwner: githubUsername,
      filesCount: files.length,
    });

    // Update project in database
    updateProject(projectId, {
      name: `${project.name} 🔗`,
      description: `GitHub: ${repo.html_url}`,
    });

    // Project saved to GitHub and Redis successfully

    return NextResponse.json({
      success: true,
      message: "Projektet har pushats till GitHub! Du äger nu all kod.",
      mode: "github",
      github: {
        repoUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        fullName: repo.full_name,
        owner: githubUsername,
        repoName: repo.name,
      },
      filesCount: files.length,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[Takeover] Error:", error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
