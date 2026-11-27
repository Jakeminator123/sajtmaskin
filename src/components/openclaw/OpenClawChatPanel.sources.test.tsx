import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { UploadedFile } from "@/components/media/file-upload-zone";
import type { SelectedSourcePage } from "@/lib/openclaw/source-page";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { OpenClawChatPanel } from "./OpenClawChatPanel";
import type { ImportedSourceImage } from "./SourcePagePanel";

const harness = vi.hoisted(() => ({
  send: vi.fn<(text: string, options?: { onDispatchAccepted?: () => void }) => void>(),
  selectFiles: (_files: UploadedFile[]) => {},
  selectSource: (_source: SelectedSourcePage, _image?: ImportedSourceImage) => {},
}));

vi.mock("./useOpenClawChat", () => ({
  useOpenClawChat: () => ({ messages: [], isStreaming: false, send: harness.send, stop: vi.fn(), clearConversation: vi.fn() }),
}));
vi.mock("./ReadTaskAttachments", () => ({
  ReadTaskAttachments: ({ files, onFilesChange }: { files: UploadedFile[]; onFilesChange: typeof harness.selectFiles }) => {
    harness.selectFiles = onFilesChange;
    return <output data-testid="selected-files">{files.map((file) => file.id).join(",")}</output>;
  },
}));
vi.mock("./SourcePagePanel", async (importOriginal) => ({
  ...await importOriginal<typeof import("./SourcePagePanel")>(),
  SourcePagePanel: ({ onUse }: { onUse: typeof harness.selectSource }) => {
    harness.selectSource = onUse;
    return <span data-testid="source-picker" />;
  },
}));

it("keeps attachments, page selections and late callbacks within their widget conversation", () => {
  const file = (id: string): UploadedFile => ({
    id, url: "https://example.org/" + id + ".jpg", filename: id + ".jpg", mimeType: "image/jpeg", size: 32, status: "success",
  });
  const source = { url: "https://example.org/bilar", passage: "Bilar" };
  const switchChat = (id: string) => act(() => useOpenClawStore.getState().setScope("/builder::builder::" + id));
  const ask = (text: string) => {
    const input = screen.getByPlaceholderText("Fråga Sajtagenten...");
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: "Enter" });
  };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ editEnabled: true }) })));
  useOpenClawStore.setState({ avatarMode: false, panelPresentation: "bubble", campaignScript: null });
  switchChat("A");
  render(<OpenClawChatPanel onClose={vi.fn()} />);
  act(() => harness.selectFiles([file("11")]));
  act(() => harness.selectSource(source, file("12")));
  expect(screen.getByTestId("selected-files").textContent).toBe("11,12");
  const lateUpload = harness.selectFiles;
  const lateImport = harness.selectSource;
  ask("Vad visar de?");
  const lateAcceptance = harness.send.mock.lastCall?.[1]?.onDispatchAccepted;
  expect(lateAcceptance).toBeTypeOf("function");

  switchChat("B");
  expect(screen.getByTestId("selected-files").textContent).toBe("");
  expect(screen.queryByText(/Vald källa/)).toBeNull();
  ask("Vanlig fråga");
  expect(harness.send).toHaveBeenLastCalledWith("Vanlig fråga", undefined);
  act(() => harness.selectFiles([file("21")]));
  act(() => { lateUpload([file("13")]); lateImport(source, file("14")); lateAcceptance?.(); });
  expect(screen.getByTestId("selected-files").textContent).toBe("21");
  ask("Vad visar bild B?");
  expect(harness.send).toHaveBeenLastCalledWith("Vad visar bild B?", expect.objectContaining({
    readTask: { attachmentIds: [21], source: undefined },
  }));

  switchChat("A");
  act(() => { lateUpload([file("15")]); lateImport(source, file("16")); });
  expect(screen.getByTestId("selected-files").textContent).toBe("");
  expect(screen.queryByText(/Vald källa/)).toBeNull();
});

it("invalidates pickers and a recorded question even when a return to the same chat is batched", () => {
  const recordings: TestRecognition[] = [];
  class TestRecognition {
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onresult: ((event: unknown) => void) | null = null;
    abort = vi.fn();
    start() { recordings.push(this); this.onstart?.(); }
    stop() { this.onend?.(); }
  }
  harness.send.mockClear();
  vi.stubGlobal("SpeechRecognition", TestRecognition);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ editEnabled: true }) })));
  act(() => useOpenClawStore.getState().setScope("/builder::builder::A"));
  render(<OpenClawChatPanel onClose={vi.fn()} />);
  const oldFilesPicker = screen.getByTestId("selected-files");
  const oldPagePicker = screen.getByTestId("source-picker");
  const file: UploadedFile = { id: "31", url: "https://example.org/a.jpg", filename: "a.jpg", mimeType: "image/jpeg", size: 32, status: "success" };
  act(() => harness.selectFiles([file]));
  const latePicker = harness.selectFiles;
  fireEvent.click(screen.getByRole("button", { name: "Tala in meddelande" }));
  const [recording] = recordings;
  expect(recording).toBeDefined();

  act(() => {
    useOpenClawStore.getState().setScope("/builder::builder::B");
    useOpenClawStore.getState().setScope("/builder::builder::A");
    recording?.onresult?.({ results: [[{ transcript: "Vad visar bilden?", isFinal: true }]] });
    recording?.onend?.();
    latePicker([file]);
  });
  expect(harness.send).not.toHaveBeenCalled();
  expect(screen.getByTestId("selected-files").textContent).toBe("");
  expect(screen.getByTestId("selected-files")).not.toBe(oldFilesPicker);
  expect(screen.getByTestId("source-picker")).not.toBe(oldPagePicker);
});
