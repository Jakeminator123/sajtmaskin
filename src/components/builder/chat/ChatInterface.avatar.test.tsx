/**
 * Avataren har EN yta åt gången: knappen vid komposern, eller byggkubens
 * Avatar-sida. Två ytor som var för sig kan starta en ström vore två betalda
 * D-ID-anslutningar för samma samtal. Samma mock-harness som
 * ChatInterface.sajtagent.test.tsx.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SajtagentContextValue } from "./sajtagent/SajtagentProvider";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));
vi.mock("@/components/forms/voice-recorder", () => ({ VoiceRecorder: () => null }));
vi.mock("@/components/media/file-upload-zone", () => ({
  FileUploadZone: () => null,
  filesToAttachments: () => [],
  filesToPromptText: () => "",
}));
vi.mock("@/components/media/media-drawer", () => ({ MediaDrawer: () => null }));
vi.mock("@/components/media/text-uploader", () => ({ TextUploader: () => null }));
vi.mock("@/components/openclaw/OpenClawPowersControl", () => ({
  OpenClawPowersControl: () => null,
}));
vi.mock("./sajtagent/SajtagentAvatar", () => ({
  SajtagentAvatar: () => <div data-testid="inline-avatar" />,
}));

const sajtagent = vi.hoisted(() => ({ value: null as SajtagentContextValue | null }));
vi.mock("./sajtagent/SajtagentProvider", () => ({
  useSajtagent: () => sajtagent.value,
}));

import { ChatInterface } from "./ChatInterface";

function makeAgent(overrides: Partial<SajtagentContextValue> = {}): SajtagentContextValue {
  return {
    available: true,
    messages: [],
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
    armedMandate: null,
    campaignScript: null,
    ...overrides,
  };
}

afterEach(() => {
  sajtagent.value = null;
  vi.clearAllMocks();
});

describe("ChatInterface — avatarens yta", () => {
  it("visar avatarknappen vid komposern när Sajtagenten finns i chatten", () => {
    sajtagent.value = makeAgent();
    render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} />);
    expect(screen.getByTestId("inline-avatar")).toBeTruthy();
  });

  it("lämnar avataren åt byggkuben när den har en egen sida där", () => {
    sajtagent.value = makeAgent();
    render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} avatarElsewhere />);
    expect(screen.queryByTestId("inline-avatar")).toBeNull();
    // Resten av komposern är orörd.
    expect(screen.getByRole("textbox", { name: "Skriv en uppdatering" })).toBeTruthy();
  });

  it("visar ingen avatar utan agent eller utan chatt", () => {
    sajtagent.value = makeAgent({ available: false });
    const { unmount } = render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} />);
    expect(screen.queryByTestId("inline-avatar")).toBeNull();
    unmount();

    sajtagent.value = makeAgent();
    render(<ChatInterface chatId={null} onSendMessage={vi.fn()} />);
    expect(screen.queryByTestId("inline-avatar")).toBeNull();
  });
});
