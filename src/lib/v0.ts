/**
 * v0 SDK client wrapper (`v0-sdk`).
 *
 * Used for v0 Platform API operations the product still relies on (chat/version
 * CRUD, templates, registry init, zip download, deploy-related calls). Builder
 * **codegen** streams use the own-engine (`createGenerationPipeline` → `engine.ts`);
 * this module does not switch that path. Optional `V0_FALLBACK_BUILDER` only affects
 * builder **preview URL** preference when a v0-hosted demo exists — see ENV docs.
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
