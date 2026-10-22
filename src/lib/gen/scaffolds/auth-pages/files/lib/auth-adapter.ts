export type AuthIntent = "login" | "signup" | "reset-password";

export type AuthSubmission =
  | { intent: "login"; email: string; password: string }
  | { intent: "signup"; email: string; name: string; password: string }
  | { intent: "reset-password"; email: string };

export type AuthResult = { ok: boolean; message: string };

export interface AuthAdapter {
  // Respect cancellation. A timeout does not prove a server action failed;
  // the provider owns status reconciliation and retry/idempotency guarantees.
  submit(input: AuthSubmission, signal: AbortSignal): Promise<AuthResult>;
}

/** Connect a real provider or server action here. Server validation and
 * session creation belong to that provider, never to this starter form.
 * Do not store passwords or manufacture a session in browser storage. */
export const authAdapter: AuthAdapter = {
  async submit() {
    return {
      ok: false,
      message:
        "Autentiseringstjänsten är inte ansluten. Ingen inloggning, registrering eller återställning har utförts.",
    };
  },
};
