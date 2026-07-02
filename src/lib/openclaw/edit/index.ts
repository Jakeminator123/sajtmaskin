/**
 * OpenClaw prompt-driven edit agent (flag-gated by OPENCLAW_EDIT_AGENT).
 *
 * Isolated barrel so the whole feature is trivially removable: deleting this
 * folder + the route + the widget affordance + the env flag reverts to today's
 * "OpenClaw only suggests UI actions" behavior. No core-pipeline registration.
 */
export {
  requestQuickEditOps,
  type RequestEditOpsResult,
} from "./gateway";
export {
  buildEditOpsPrompt,
  type BuildEditOpsPromptInput,
  type EditOpsPrompt,
} from "./prompt";
export {
  parseOpenClawEditOps,
  extractFirstJsonObject,
  openClawEditOpsPayloadSchema,
  openClawQuickEditOpSchema,
  type ParseOpenClawEditOpsResult,
} from "./ops-schema";
