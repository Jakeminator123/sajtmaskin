/**
 * v0 SDK client wrapper.
 *
 * FALLBACK-ONLY for code generation: When V0_FALLBACK_BUILDER=y, the stream
 * route uses v0-generator. Otherwise the gen/ engine is used.
 *
 * This module is still required for: v0 API routes (chat ops, versions, init,
 * deploy, etc.). Do not remove — fallback and templates/registry still need it.
 */
import { createClient } from "v0-sdk";
import { errorLog } from "@/lib/utils/debug";
import { SECRETS } from "@/lib/config";

export function assertV0Key(): void {
  if (!SECRETS.v0ApiKey) {
    errorLog("v0", "Missing V0_API_KEY");
    throw new Error("Missing V0_API_KEY. Set it in your environment.");
  }
}

// Initialize v0 SDK with API key
export const v0 = createClient({
  apiKey: SECRETS.v0ApiKey || "",
});
