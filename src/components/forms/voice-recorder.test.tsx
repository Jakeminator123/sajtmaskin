import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceRecorder } from "./voice-recorder";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;
const getUserMedia = vi.fn();
const closeAudio = vi.fn(async () => undefined);
const fetchAudio = vi.fn();
const recorders: FakeRecorder[] = [];
const latestRecorder = () => recorders[recorders.length - 1];

class FakeRecorder {
  static isTypeSupported = vi.fn(() => true);
  static failConstruction = false;
  state = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    if (FakeRecorder.failConstruction) throw new Error("Recorder unavailable");
    this.mimeType = options?.mimeType ?? "audio/mp4";
    recorders.push(this);
  }
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({
        data: new Blob(["audio"], { type: this.mimeType }),
      });
      this.onstop?.();
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  recorders.length = 0;
  FakeRecorder.failConstruction = false;
  FakeRecorder.isTypeSupported.mockImplementation(() => true);
  getUserMedia.mockResolvedValue(stream);
  fetchAudio.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, transcript: "Hej" }),
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal(
    "AudioContext",
    class {
      close = closeAudio;
      createAnalyser = () => ({
        fftSize: 0,
        frequencyBinCount: 2,
        getByteFrequencyData: vi.fn(),
      });
      createMediaStreamSource = () => ({ connect: vi.fn() });
    },
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("fetch", fetchAudio);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function start() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
  });
  expect(screen.getByRole("button").textContent).toContain("Stoppa");
}

describe("VoiceRecorder — recording ownership", () => {
  it("releases a microphone granted after the recorder has unmounted", async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(permission.promise);
    const onRecordingChange = vi.fn();
    const { unmount } = render(
      <VoiceRecorder
        onTranscript={vi.fn()}
        onRecordingChange={onRecordingChange}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    unmount();
    await act(async () => {
      permission.resolve(stream);
    });
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(onRecordingChange).not.toHaveBeenCalledWith(true);
    expect(fetchAudio).not.toHaveBeenCalled();
  });

  it("owns only one permission request even before React renders the pending state", async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValue(permission.promise);
    const { unmount } = render(<VoiceRecorder onTranscript={vi.fn()} />);
    const button = screen.getByRole("button");
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      permission.resolve(stream);
    });
  });

  it("stops capture, metering and the timer on unmount without transcribing", async () => {
    const clearTimer = vi.spyOn(globalThis, "clearInterval");
    const onRecordingChange = vi.fn();
    const { unmount } = render(
      <VoiceRecorder
        onTranscript={vi.fn()}
        onRecordingChange={onRecordingChange}
      />,
    );
    await start();
    unmount();
    await act(async () => undefined);
    expect(latestRecorder().stop).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(closeAudio).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(clearTimer).toHaveBeenCalled();
    expect(onRecordingChange.mock.calls.map(([value]) => value)).toEqual([
      true,
      false,
    ]);
    expect(fetchAudio).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "keeps Stop available when the parent disables input (compact=%s)",
    async (compact) => {
      const props = { compact, onTranscript: vi.fn() };
      const { rerender } = render(<VoiceRecorder {...props} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button"));
      });
      rerender(<VoiceRecorder {...props} disabled />);
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        false,
      );
      await act(async () => {
        fireEvent.click(screen.getByRole("button"));
      });
      expect(track.stop).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(props.onTranscript).toHaveBeenCalledWith("Hej"),
      );
    },
  );

  it("uploads MP4 with its actual MIME type and filename when WebM is unavailable", async () => {
    FakeRecorder.isTypeSupported.mockImplementation(
      (mime?: string) => mime === "audio/mp4",
    );
    const onTranscript = vi.fn();
    render(<VoiceRecorder onTranscript={onTranscript} language="en" />);
    await start();
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(latestRecorder().mimeType).toBe("audio/mp4");
    const body = fetchAudio.mock.calls[0][1].body as FormData;
    const audio = body.get("audio") as File;
    expect(audio.type).toBe("audio/mp4");
    expect(audio.name).toBe("recording.mp4");
    expect(body.get("language")).toBe("en");
    expect(onTranscript).toHaveBeenCalledWith("Hej");
  });

  it("aborts transcription and ignores its late response after changing chats", async () => {
    const response = deferred<Response>();
    fetchAudio.mockReturnValueOnce(response.promise);
    const onOldTranscript = vi.fn();
    const onNewTranscript = vi.fn();
    const { rerender } = render(
      <VoiceRecorder key="old-chat" onTranscript={onOldTranscript} />,
    );
    await start();
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    const signal = fetchAudio.mock.calls[0][1].signal as AbortSignal;
    rerender(<VoiceRecorder key="new-chat" onTranscript={onNewTranscript} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      response.resolve({
        ok: true,
        json: async () => ({ success: true, transcript: "Gammalt svar" }),
      } as Response);
    });
    expect(onOldTranscript).not.toHaveBeenCalled();
    expect(onNewTranscript).not.toHaveBeenCalled();
  });

  it("releases microphone access if MediaRecorder construction fails", async () => {
    FakeRecorder.failConstruction = true;
    render(<VoiceRecorder onTranscript={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(fetchAudio).not.toHaveBeenCalled();
    expect(screen.getByText(/Kunde inte starta inspelning/)).toBeTruthy();
  });

  it("can still dictate when audio metering is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const onTranscript = vi.fn();
    render(<VoiceRecorder onTranscript={onTranscript} />);
    await start();
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(onTranscript).toHaveBeenCalledWith("Hej");
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("discards a failed recording and permits a fresh attempt", async () => {
    render(<VoiceRecorder onTranscript={vi.fn()} />);
    await start();
    await act(async () => {
      latestRecorder().onerror?.();
    });
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(closeAudio).toHaveBeenCalledTimes(1);
    expect(fetchAudio).not.toHaveBeenCalled();
    expect(screen.getByText(/Inspelningen avbröts/)).toBeTruthy();
    await start();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});
