import { resolveBuildIntentForMethod, type BuildIntent } from "@/lib/builder/build-intent";
import { buildAuditDisplayPrompt, type AuditHandoffPayload } from "@/lib/builder/audit-handoff";

export type AuditBuildHandoffResult = {
  projectId: string;
  promptId: string;
  href: string;
};

const ATTEMPT_KEY = "sajtmaskin:audit-build-attempt:v1";

async function getAttempt(payload: AuditHandoffPayload): Promise<string> {
  try {
    // Persist retry identity, not the analysis report itself.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const raw = window.localStorage.getItem(ATTEMPT_KEY);
    const previous = raw ? JSON.parse(raw) : null;
    if (
      previous?.fingerprint === fingerprint &&
      typeof previous.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previous.id)
    )
      return previous.id;
    const id = crypto.randomUUID();
    window.localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ id, fingerprint }));
    return id;
  } catch {
    // Do not start a durable operation when its ambiguous ACK cannot be retried.
    throw new Error("Kunde inte spara byggförsöket. Tillåt lokal lagring och försök igen.");
  }
}

export async function createAuditBuildHandoff(
  payload: AuditHandoffPayload,
  selectedIntent: BuildIntent,
): Promise<AuditBuildHandoffResult> {
  const prompt = buildAuditDisplayPrompt(payload);
  const auditBuildAttemptId = await getAttempt(payload);
  const response = await fetch("/api/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, source: "audit", auditBuildAttemptId, payload }),
  });
  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    promptId?: string;
    projectId?: string;
    consumed?: boolean;
    error?: string;
  } | null;
  if (!response.ok || !data?.success || !data.promptId || !data.projectId) {
    throw new Error(data?.error || "Kunde inte spara audit-prompten");
  }

  const intent = resolveBuildIntentForMethod("audit", selectedIntent);
  const params = new URLSearchParams();
  params.set("project", data.projectId);
  params.set("source", "audit");
  // Consumption is not proof that builder hydration/navigation succeeded.
  // The existing owner-scoped GET can restore even a consumed audit prompt.
  params.set("promptId", data.promptId);
  params.set("buildMethod", "audit");
  params.set("buildIntent", intent);

  // Retain the last analysis attempt through reloads/tabs/navigation errors.
  // A different analysis payload starts a new intent; the server also binds the id to the authenticated owner.
  return {
    projectId: data.projectId,
    promptId: data.promptId,
    href: `/builder?${params.toString()}`,
  };
}
