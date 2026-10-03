import { resolveBuildIntentForMethod, type BuildIntent } from "@/lib/builder/build-intent";
import { buildAuditDisplayPrompt, type AuditHandoffPayload } from "@/lib/builder/audit-handoff";
import { useAuthStore } from "@/lib/auth/auth-store";

export type AuditBuildHandoffResult = {
  projectId: string;
  promptId: string;
  href: string;
};

const ATTEMPT_PREFIX = "sajtmaskin:audit-build-attempt:v1:";

async function getAttempt(payload: AuditHandoffPayload, ownerId: string, supersededId?: string): Promise<string> {
  try {
    // Persist retry identity, not the analysis report itself.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([ownerId, payload])),
    );
    const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const key = `${ATTEMPT_PREFIX}${fingerprint}`;
    // The public analysis resume flow already requires Web Locks. Fail before
    // persistence rather than mint two ids in a cross-tab read/write race.
    if (!navigator.locks) throw new Error("Web Locks unavailable");
    return await navigator.locks.request(key, { mode: "exclusive" }, () => {
      const previous = window.localStorage.getItem(key);
      if (
        previous && previous !== supersededId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previous)
      )
        return previous;
      const id = crypto.randomUUID();
      window.localStorage.setItem(key, id);
      return id;
    });
  } catch {
    // Do not start a durable operation when its ambiguous ACK cannot be retried.
    throw new Error(
      "Kunde inte spara byggförsöket. Tillåt lokal lagring och använd en uppdaterad webbläsare.",
    );
  }
}

export async function createAuditBuildHandoff(
  payload: AuditHandoffPayload,
  selectedIntent: BuildIntent,
): Promise<AuditBuildHandoffResult> {
  const prompt = buildAuditDisplayPrompt(payload);
  const ownerId = useAuthStore.getState().user?.id;
  if (!ownerId) throw new Error("Logga in för att bygga hemsidan.");
  let auditBuildAttemptId = await getAttempt(payload, ownerId);
  type HandoffResponse = {
    success?: boolean;
    promptId?: string;
    projectId?: string;
    consumed?: boolean;
    error?: string;
    code?: string;
  } | null;
  const request = async () => {
    const response = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, source: "audit", auditBuildAttemptId, auditBuildOwnerId: ownerId, payload }),
    });
    return { response, data: await response.json().catch(() => null) as HandoffResponse };
  };
  let { response, data } = await request();
  if (response.status === 409 && data?.code === "AUDIT_HANDOFF_PROJECT_MISSING") {
    // The owner-bound server has positively confirmed the old project is gone.
    // Rotate once, atomically across tabs; never rotate on an ambiguous ACK or
    // ordinary payload conflict, and never delete a server project/handoff.
    auditBuildAttemptId = await getAttempt(payload, ownerId, auditBuildAttemptId);
    ({ response, data } = await request());
  }
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

  // Retain one attempt per analysis through reloads/tabs/navigation errors.
  // Other analyses cannot overwrite it; the server binds each id to the authenticated owner.
  return {
    projectId: data.projectId,
    promptId: data.promptId,
    href: `/builder?${params.toString()}`,
  };
}
