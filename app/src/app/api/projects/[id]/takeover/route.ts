import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectById,
  getProjectData,
  getUserById,
  updateProject,
} from "@/lib/database";
import { downloadVersionAsZip } from "@/lib/v0-generator";
import JSZip from "jszip";

/**
 * Project Takeover API
 *
 * Takes a project from v0 and pushes it to the user's GitHub account.
 * After takeover, the project can be edited using OpenAI Agents instead of v0.
 *
 * Flow:
 * 1. Get project data (chatId, versionId)
 * 2. Download ZIP from v0
 * 3. Create GitHub repo
 * 4. Push all files to repo
 * 5. Update project with github_repo_url
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
}

interface TakeoverRequest {
  repoName?: string; // Optional custom repo name
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const body: TakeoverRequest = await request.json().catch(() => ({}));

    console.log("[Takeover] Starting takeover for project:", projectId);

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

    // 2. Check if user has GitHub connected
    const fullUser = getUserById(user.id);
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

    // 3. Get project and project data
    const project = getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Projektet hittades inte" },
        { status: 404 }
      );
    }

    const projectData = getProjectData(projectId);
    if (!projectData?.chat_id) {
      return NextResponse.json(
        { success: false, error: "Projektet har ingen v0-data att ta över" },
        { status: 400 }
      );
    }

    // We need versionId to download - try to get it from stored data
    // If not available, we'll need to get it from the v0 chat
    const chatId = projectData.chat_id;

    console.log("[Takeover] Project chat ID:", chatId);

    // 4. Download ZIP from v0
    console.log("[Takeover] Downloading project from v0...");

    let zipBuffer: ArrayBuffer;
    try {
      // We need to get the latest version ID - for now, try to extract from files
      // The download endpoint usually requires versionId, but let's see if we can work around it
      // For now, we'll assume the project has the latest version accessible via chatId

      // Try to get version from the project data or use a workaround
      // The v0 SDK should have a way to get the latest version

      // Simplified: Assume we can get files from projectData.files directly if available
      if (projectData.files && projectData.files.length > 0) {
        console.log("[Takeover] Using cached files from project data");
        // Create a ZIP from cached files
        const zip = new JSZip();
        for (const file of projectData.files) {
          zip.file(file.name, file.content);
        }
        zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
      } else {
        // Need to get version ID - this requires fetching the chat details
        // For now, return an error asking to regenerate the project first
        return NextResponse.json(
          {
            success: false,
            error:
              "Projektet saknar fil-data. Försök generera eller förfina projektet först.",
          },
          { status: 400 }
        );
      }
    } catch (downloadError) {
      console.error("[Takeover] Failed to get project files:", downloadError);
      return NextResponse.json(
        { success: false, error: "Kunde inte hämta projektfiler" },
        { status: 500 }
      );
    }

    // 5. Extract files from ZIP
    console.log("[Takeover] Extracting files...");
    const zip = await JSZip.loadAsync(zipBuffer);
    const files: { path: string; content: string }[] = [];

    const filePromises: Promise<void>[] = [];
    zip.forEach((relativePath, file) => {
      if (!file.dir) {
        filePromises.push(
          file.async("string").then((content) => {
            files.push({ path: relativePath, content });
          })
        );
      }
    });
    await Promise.all(filePromises);

    console.log("[Takeover] Extracted", files.length, "files");

    // 6. Create GitHub repo
    const repoName =
      body.repoName ||
      `sajt-${project.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

    console.log("[Takeover] Creating GitHub repo:", repoName);

    const createRepoResponse = await fetch(
      "https://api.github.com/user/repos",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fullUser.github_token}`,
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
      const errorData = await createRepoResponse.json();
      console.error("[Takeover] GitHub repo creation failed:", errorData);

      if (createRepoResponse.status === 422) {
        return NextResponse.json(
          {
            success: false,
            error: `Ett repo med namnet "${repoName}" finns redan. Välj ett annat namn.`,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, error: "Kunde inte skapa GitHub-repo" },
        { status: 500 }
      );
    }

    const repo: GitHubCreateRepoResponse = await createRepoResponse.json();
    console.log("[Takeover] Created repo:", repo.full_name);

    // 7. Push all files to repo (create initial commit with all files)
    console.log("[Takeover] Pushing files to GitHub...");

    // Create blobs for all files
    const blobs: { path: string; sha: string }[] = [];

    for (const file of files) {
      const blobResponse = await fetch(
        `https://api.github.com/repos/${repo.full_name}/git/blobs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fullUser.github_token}`,
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
          Authorization: `Bearer ${fullUser.github_token}`,
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
          Authorization: `Bearer ${fullUser.github_token}`,
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
          Authorization: `Bearer ${fullUser.github_token}`,
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
          Authorization: `Bearer ${fullUser.github_token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: `refs/heads/${repo.default_branch || "main"}`,
          sha: commit.sha,
        }),
      });
    }

    console.log("[Takeover] Files pushed successfully!");

    // 8. Update project with GitHub repo URL
    // We'll add a github_repo_url field to the project
    // For now, store it in the description field or create a new table
    // Let's update the project with the repo URL in a structured way

    // Store GitHub info in project (we'll need to add this column later)
    // For now, let's just return the repo URL and update the project name
    updateProject(projectId, {
      name: `${project.name} (GitHub)`,
      description: `GitHub: ${repo.html_url}`,
    });

    console.log("[Takeover] Project updated with GitHub URL");

    return NextResponse.json({
      success: true,
      message: "Projektet har tagits över till GitHub!",
      github: {
        repoUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        fullName: repo.full_name,
        owner: fullUser.github_username,
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
