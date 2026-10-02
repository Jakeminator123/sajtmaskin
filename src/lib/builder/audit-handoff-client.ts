import { createProject } from "@/lib/projects/project-client";
import {
  resolveBuildIntentForMethod,
  type BuildIntent,
} from "@/lib/builder/build-intent";
import {
  buildAuditDisplayPrompt,
  type AuditHandoffPayload,
} from "@/lib/builder/audit-handoff";

export type AuditBuildHandoffResult = {
  projectId: string;
  promptId: string;
  href: string;
};

export async function createAuditBuildHandoff(
  payload: AuditHandoffPayload,
  selectedIntent: BuildIntent,
): Promise<AuditBuildHandoffResult> {
  const prompt = buildAuditDisplayPrompt(payload);
  const project = await createProject(
    `Audit - ${new Date().toLocaleDateString("sv-SE")}`,
    "audit",
    prompt.substring(0, 100),
  );
  const response = await fetch("/api/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, source: "audit", projectId: project.id, payload }),
  });
  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    promptId?: string;
    error?: string;
  } | null;
  if (!response.ok || !data?.promptId) {
    throw new Error(data?.error || "Kunde inte spara audit-prompten");
  }

  const intent = resolveBuildIntentForMethod("audit", selectedIntent);
  const params = new URLSearchParams();
  params.set("project", project.id);
  params.set("source", "audit");
  params.set("promptId", data.promptId);
  params.set("buildMethod", "audit");
  params.set("buildIntent", intent);

  return {
    projectId: project.id,
    promptId: data.promptId,
    href: `/builder?${params.toString()}`,
  };
}
