"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  DEFAULT_PROJECT_NAME,
  isDefaultProjectName,
  projectNameFromPrompt,
} from "@/lib/builder/project-name-suggestion";
import type { Project } from "@/lib/projects/project-client";
import { debugLog } from "@/lib/utils/debug";

type ProjectRenamer = {
  renameProjectIfNameIs: (
    id: string,
    expectedName: string,
    name: string,
  ) => Promise<{ renamed: boolean; project: Project | null }>;
};

/**
 * First build in a project that still carries the placeholder name: name it
 * after the prompt. The server renames only while the row still has the
 * placeholder (compare-and-set), so a stale name in this tab can never
 * overwrite a name set elsewhere. `knownName` only saves the round trip when
 * the builder already shows a real name. Returns the new name, or null.
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
  const result = await client.renameProjectIfNameIs(projectId, DEFAULT_PROJECT_NAME, name);
  if (!result.renamed) return null;
  return result.project?.name?.trim() || name;
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
