/**
 * Server-side read of a project's Företagsuppgifter for the generation stream.
 *
 * Both generation entry points (init in `create-chat-stream-post.ts`, follow-up
 * in `codegen-turn.ts`) call this with the app project id. A missing project,
 * a missing `project_data` row or a DB hiccup all resolve to `null`: the prompt
 * then simply has no facts block, which is the pre-feature behaviour, and a
 * generation must never fail because of it.
 */
import { getProjectData } from "@/lib/db/services/projects";
import {
  hasBusinessFacts,
  readBusinessFactsFromMeta,
  type BusinessFactsPersisted,
} from "./business-facts-schema";

export async function loadBusinessFactsForProject(
  appProjectId: string | null | undefined,
): Promise<BusinessFactsPersisted | null> {
  const id = appProjectId?.trim();
  if (!id) return null;
  try {
    const data = await getProjectData(id);
    const facts = readBusinessFactsFromMeta(
      (data?.meta as Record<string, unknown> | null | undefined) ?? null,
    );
    return hasBusinessFacts(facts) ? facts : null;
  } catch (error) {
    console.warn("[business-facts] Could not load facts for project", id, error);
    return null;
  }
}
