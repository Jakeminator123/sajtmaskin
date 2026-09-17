/** App-session failures are not AI-provider authentication failures. */
export const GENERATION_AUTH_REQUIRED_MESSAGE =
  "Logga in eller skapa ett konto för att fortsätta. Ditt utkast finns kvar.";

export function isGenerationAuthRequired(
  status: number,
  payload: unknown,
): boolean {
  if (status !== 401 || !payload || typeof payload !== "object") return false;
  const data = payload as Record<string, unknown>;
  return data.requiresAuth === true || data.code === "auth_required";
}
