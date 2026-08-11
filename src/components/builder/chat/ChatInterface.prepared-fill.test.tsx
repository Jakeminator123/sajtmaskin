/**
 * OpenClaw prepared-fill-markörens livscykel i composern.
 *
 * Markören ("senaste OC-fyllning av builder.chat.primary") får bara tagga det
 * FÖRSTA utskicket som konsumerar den. Bugbot 2026-08-01: plan-läget skickar
 * med `clearDraft: false`, och markören låg tidigare kvar efter plan-turen —
 * ett senare codegen-utskick med samma text ärvde då taggen felaktigt. Nu
 * släpps markören villkorslöst efter varje genomfört utskick.
 *
 * Samma mock-harness som ChatInterface.draft-retention.test.tsx.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageOptions } from "@/lib/hooks/chat/types";

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
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { OPENCLAW_BUILDER_CHAT_TARGET } from "@/lib/openclaw/prepared-prompt";

const FILLED = [
  "Gör om hero-sektionen.",
  "",
  "Mål:",
  "- Tydligare värdeerbjudande direkt vid inladdning",
  "",
  "Sektioner:",
  "- Hero med rubrik, underrubrik och primär CTA",
  "- Socialt bevis direkt under hero",
  "",
  "Design:",
  "- Behåll färgtemat men öka kontrasten i rubriken",
].join("\n");

function armPreparedFill() {
  act(() => {
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy"],
      preparedFill: { target: OPENCLAW_BUILDER_CHAT_TARGET, value: FILLED },
    });
  });
}

afterEach(() => {
  act(() => {
    useOpenClawStore.setState({
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      preparedFill: null,
    });
  });
  vi.clearAllMocks();
});

describe("ChatInterface prepared-fill marker", () => {
  it("tags the send that matches the fill and drops the marker afterwards", async () => {
    const seen: Array<MessageOptions | undefined> = [];
    const onSendMessage = vi.fn(async (_m: string, opts?: MessageOptions) => {
      seen.push(opts);
      return { status: "started", via: "stream" } as const;
    });
    armPreparedFill();
    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);

    const textarea = screen.getByLabelText("Skriv en uppdatering");
    fireEvent.change(textarea, { target: { value: FILLED } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(seen[0]?.promptSource).toBe("openclaw-prepared");
    await waitFor(() => {
      expect(useOpenClawStore.getState().preparedFill).toBeNull();
    });
  });

  it("drops the marker after a plan-mode send (clearDraft: false) so codegen cannot inherit the tag", async () => {
    const seen: Array<MessageOptions | undefined> = [];
    const onSendMessage = vi.fn(async (_m: string, opts?: MessageOptions) => {
      seen.push(opts);
      return { status: "started", via: "stream" } as const;
    });
    armPreparedFill();
    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);

    const textarea = screen.getByLabelText("Skriv en uppdatering");
    fireEvent.change(textarea, { target: { value: FILLED } });

    // Plan-knappen skickar med clearDraft:false. Den låg tidigare bakom
    // "Avancerat"-popovern; #692 tog bort popovern och renderar Plan som en
    // vanlig verktygsknapp.
    fireEvent.click(await screen.findByRole("button", { name: /Plan/ }));

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(seen[0]?.planMode).toBe(true);
    // Markören är konsumerad trots att utkastet ligger kvar …
    await waitFor(() => {
      expect(useOpenClawStore.getState().preparedFill).toBeNull();
    });
    expect((textarea as HTMLTextAreaElement).value).toBe(FILLED);

    // … så nästa (codegen-)utskick av samma text får INTE taggen.
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(2));
    expect(seen[1]?.promptSource).toBeUndefined();
  });

  // The fast lane is part of the granted behaviour, so a fill left over from a
  // grant the user has since withdrawn must not tag the next send.
  it("does not tag when the powers button is off", async () => {
    const seen: Array<MessageOptions | undefined> = [];
    const onSendMessage = vi.fn(async (_m: string, opts?: MessageOptions) => {
      seen.push(opts);
      return { status: "started", via: "stream" } as const;
    });
    armPreparedFill();
    act(() => {
      useOpenClawStore.setState({ powersOn: false });
    });
    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);

    const textarea = screen.getByLabelText("Skriv en uppdatering");
    fireEvent.change(textarea, { target: { value: FILLED } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(seen[0]?.promptSource).toBeUndefined();
  });

  it("keeps the marker when the send was rejected without being recorded (retry may re-tag)", async () => {
    const onSendMessage = vi.fn(async () => ({
      status: "rejected" as const,
      reason: "stale_base_version" as const,
      turnRecorded: false,
    }));
    armPreparedFill();
    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);

    const textarea = screen.getByLabelText("Skriv en uppdatering");
    fireEvent.change(textarea, { target: { value: FILLED } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(useOpenClawStore.getState().preparedFill).not.toBeNull();
  });
});
