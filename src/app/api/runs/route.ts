import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getAllProjectsForOwner } from "@/lib/db/services/projects";
import {
  getVersionsByChat,
  listChatsByProject,
} from "@/lib/db/chat-repository-pg";

/**
 * Native-backed run history for the ported studio.
 *
 * Maps Sajtmaskin's engine model onto the viewser `runs` contract:
 *   - siteId  == engine chatId
 *   - runId   == engine versionId
 *   - a chat with >=1 version becomes a `prompt-inputs` projectInput, which
 *     is what flips the studio into builder mode (FloatingChat) for that site.
 * Optional `?siteId=` narrows to a single chat.
 */
export const dynamic = "force-dynamic";

type RunHistoryItem = {
  runId: string;
  status: string;
  siteId: string;
  projectId?: string;
  version?: number | null;
  createdAt: string;
};

type ProjectInputOption = {
  siteId: string;
  companyName: string;
  scaffoldId: string;
  variantId: string;
  language: string;
  source: "examples" | "prompt-inputs";
};

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request).catch(() => null);
    const sessionId = getSessionIdFromRequest(request);
    const siteIdFilter = new URL(request.url).searchParams.get("siteId");

    const projects = await getAllProjectsForOwner({
      userId: user?.id ?? null,
      sessionId,
    });

    const runs: RunHistoryItem[] = [];
    const projectInputs: ProjectInputOption[] = [];

    for (const project of projects) {
      const chats = await listChatsByProject(project.id).catch(() => []);
      for (const chat of chats) {
        if (siteIdFilter && chat.id !== siteIdFilter) continue;
        const versions = await getVersionsByChat(chat.id).catch(() => []);
        if (versions.length === 0) continue;

        projectInputs.push({
          siteId: chat.id,
          companyName: project.name ?? "Sajt",
          scaffoldId: chat.scaffold_id ?? "landing-page",
          variantId: "default",
          language: "sv",
          source: "prompt-inputs",
        });

        for (const v of versions) {
          runs.push({
            runId: v.id,
            status: v.verification_state ?? v.release_state ?? "ready",
            siteId: chat.id,
            projectId: project.id,
            version: v.version_number ?? null,
            createdAt: v.created_at,
          });
        }
      }
    }

    runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return NextResponse.json({ runs, projectInputs });
  } catch (e) {
    return NextResponse.json(
      {
        runs: [],
        projectInputs: [],
        error: e instanceof Error ? e.message : "Kunde inte lista runs.",
      },
      { status: 200 },
    );
  }
}
