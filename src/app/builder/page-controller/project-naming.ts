"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  isDefaultProjectName,
  projectNameFromPrompt,
} from "@/lib/builder/project-name-suggestion";
import type { Project, ProjectSite, ProjectWithData } from "@/lib/projects/project-client";
import { debugLog } from "@/lib/utils/debug";

/**
 * Builder-created placeholder project that may be reused by the next blank
 * entry (`/builder?new=1`, "Ny chatt") while it is still empty. Per browser;
 * the server still owner-scopes every read, so another account's id is a 404.
 */
export const REUSABLE_EMPTY_PROJECT_KEY = "sajtmaskin:emptyProjectId";

type ProjectReader = {
  getProject: (id: string) => Promise<ProjectWithData>;
  getProjectSite: (id: string) => Promise<ProjectSite | null>;
};

/**
 * True when the project is still the builder's untouched placeholder: default
 * name, no chat (engine chats or `project_data.chat_id`), no preview and no
 * thumbnail. Any read error answers false, so the caller creates a new one.
 */
export async function isReusableEmptyProject(
  projectId: string,
  client: ProjectReader,
): Promise<boolean> {
  try {
    const [{ project, data }, site] = await Promise.all([
      client.getProject(projectId),
      client.getProjectSite(projectId),
    ]);
    if (!project || !isDefaultProjectName(project.name) || project.thumbnail_path) return false;
    if (!site || site.chatId) return false;
    const persistedChatId = typeof data?.chat_id === "string" ? data.chat_id.trim() : "";
    const demoUrl = typeof data?.demo_url === "string" ? data.demo_url.trim() : "";
    return !persistedChatId && !demoUrl;
  } catch {
    return false;
  }
}

type ProjectRenamer = {
  getProject: (id: string) => Promise<ProjectWithData>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project>;
};

/**
 * First build in a project that still carries the placeholder name: name it
 * after the prompt. A name the user chose is never overwritten. `knownName`
 * is what the builder has loaded; `null` means not loaded yet, and then the
 * server row decides. Returns the new name, or null when nothing changed.
 */
export async function nameDefaultProjectFromPrompt({
  projectId,
  knownName,
  prompt,
  client,
}: {
  projectId: string;
  knownName: string | null;
  prompt: string;
  client: ProjectRenamer;
}): Promise<string | null> {
  const name = projectNameFromPrompt(prompt);
  if (!name) return null;
  if (knownName !== null && !isDefaultProjectName(knownName)) return null;
  if (knownName === null) {
    const { project } = await client.getProject(projectId);
    if (!isDefaultProjectName(project?.name)) return null;
  }
  const updated = await client.updateProject(projectId, { name });
  return updated?.name?.trim() || name;
}

/**
 * Returns a callback the builder runs when the first build of a chat starts.
 * Fire-and-forget: the build never waits for the rename, and a failed rename
 * only leaves the placeholder (the publish dialog still suggests a name).
 */
export function useNameProjectOnFirstBuild({
  appProjectId,
  appProjectName,
  setAppProjectName,
}: {
  appProjectId: string | null;
  appProjectName: string | null;
  setAppProjectName: Dispatch<SetStateAction<string | null>>;
}) {
  const attemptedRef = useRef(new Set<string>());
  // The rename resolves after a round trip; only apply it to the project the
  // builder still shows.
  const currentProjectIdRef = useRef(appProjectId);
  useEffect(() => {
    currentProjectIdRef.current = appProjectId;
  }, [appProjectId]);
  return useCallback(
    (prompt: string) => {
      if (!appProjectId || attemptedRef.current.has(appProjectId)) return;
      if (appProjectName !== null && !isDefaultProjectName(appProjectName)) return;
      attemptedRef.current.add(appProjectId);
      const projectId = appProjectId;
      void import("@/lib/projects/project-client")
        .then((client) =>
          nameDefaultProjectFromPrompt({ projectId, knownName: appProjectName, prompt, client }),
        )
        .then((name) => {
          if (name && currentProjectIdRef.current === projectId) setAppProjectName(name);
        })
        .catch((error) => {
          debugLog("builder", "Failed to name project from first build", error);
        });
    },
    [appProjectId, appProjectName, setAppProjectName],
  );
}
