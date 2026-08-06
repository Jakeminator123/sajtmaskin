/**
 * API Route: Website Audit
 * POST /api/audit - Analyze a website and return audit results
 *
 * Cost: See credits pricing
 * Model: OpenAI Responses API (legacy fallback via AI SDK if disabled)
 */

// Next.js route-segment config must remain a statically analyzable literal in
// the route module; re-exporting it from the handler is not detected reliably.
export const maxDuration = 300;

export { POST } from "./modules/handler";
