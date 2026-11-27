import { expect, it } from "vitest";
import { parseOpenClawMessage } from "./text-field-actions";
import { OPENCLAW_VIDEO_PROPOSAL_PROMPT, videoIntentFromProposal } from "./video-proposal";

it("parses a model video proposal as a draft with no permission, price or external media ID", () => {
  const message = 'Förbered en video. <openclaw-action>{"type":"propose_video_generation","prompt":"Kameran panorerar","insert":true,"placement":"i heron","approvedCredits":999,"submit":true,"sourceMediaId":321,"sourceUrl":"https://example.org/other.jpg"}</openclaw-action>';
  const { action, visibleContent } = parseOpenClawMessage(message);
  expect(visibleContent).toBe("Förbered en video.");
  expect(action?.type).toBe("propose_video_generation");
  if (action?.type !== "propose_video_generation") throw new Error("Inget videoförslag");
  expect(videoIntentFromProposal(action)).toEqual({ prompt: "Kameran panorerar", insert: true, placement: "i heron" });
});

it("shows the model the same known action and rejects incomplete proposals", () => {
  expect(OPENCLAW_VIDEO_PROPOSAL_PROMPT).toContain("propose_video_generation");
  const parsed = parseOpenClawMessage('<openclaw-action>{"type":"propose_video_generation","insert":false}</openclaw-action>');
  expect(parsed.action).toBeNull();
  expect(parsed.actionError).toBeTruthy();
});
