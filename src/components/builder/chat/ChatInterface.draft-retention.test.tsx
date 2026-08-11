/**
 * Draft retention on a handled rejection (outcome contract, BB#shadcn-lane1).
 *
 * `sendMessage` resolves rather than rejecting on 409 stale base / 412 tier-3
 * env, so the composer used to clear the draft — text, attachments, Figma link
 * and inspect points — for a send that never started a generation. With the
 * outcome contract the draft stays put on `rejected` and is still cleared once
 * a turn actually starts.
 *
 * Mounting ChatInterface pulls in heavy builder dependencies, so the ones that
 * need a browser runtime are mocked (same pattern as the base-badge test).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/components/forms/voice-recorder", () => ({ VoiceRecorder: () => null }));

vi.mock("@/components/media/file-upload-zone", () => ({
  FileUploadZone: () => null,
  filesToAttachments: () => [],
  filesToPromptText: () => "",
}));

vi.mock("@/components/media/media-drawer", () => ({ MediaDrawer: () => null }));
vi.mock("@/components/media/text-uploader", () => ({ TextUploader: () => null }));

import { ChatInterface } from "./ChatInterface";

const DRAFT = "Gör hero-rubriken kortare";

async function typeAndSend(outcome: SendMessageOutcome) {
  const onSendMessage = vi.fn(async () => outcome);
  render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);

  const textarea = screen.getByLabelText("Skriv en uppdatering");
  fireEvent.change(textarea, { target: { value: DRAFT } });
  expect((textarea as HTMLTextAreaElement).value).toBe(DRAFT);

  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
  return textarea as HTMLTextAreaElement;
}

describe("ChatInterface draft retention", () => {
  it("keeps the draft when the rejected turn was never written down", async () => {
    const textarea = await typeAndSend({
      status: "rejected",
      reason: "stale_base_version",
      turnRecorded: false,
    });
    await waitFor(() => expect(textarea.value).toBe(DRAFT));
  });

  it("clears the draft once a generation actually started", async () => {
    const textarea = await typeAndSend({ status: "started", via: "stream" });
    await waitFor(() => expect(textarea.value).toBe(""));
  });

  // Bugbot on #610: a rejection the server DID write down leaves the prompt in
  // the thread, so keeping the draft too would put it in two places and let a
  // resend duplicate the turn.
  it("clears the draft when the rejected turn was recorded server-side", async () => {
    const textarea = await typeAndSend({
      status: "rejected",
      reason: "tier3_env_not_ready",
      turnRecorded: true,
    });
    await waitFor(() => expect(textarea.value).toBe(""));
  });

  // The F3 deterministic ReleaseGate round consumes the prompt (and may promote
  // a version), so it must NOT be treated as a rejection at all — that would
  // leave the whole draft behind for a turn that completed.
  it("clears the draft when the turn settled as an F3 ReleaseGate round", async () => {
    const textarea = await typeAndSend({
      status: "settled",
      as: "f3_deterministic_release",
    });
    await waitFor(() => expect(textarea.value).toBe(""));
  });
});
