import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewBackdrop } from "./PreviewBackdrop";
import {
  installIntersectionObserver,
  type FakeIntersectionObserver,
} from "./PreviewBackdrop.test-support";
import { PREVIEW_BACKDROP_POSTER_URL } from "@/lib/builder/preview-backdrop-media";

const PAUSE_LABEL = "Pausa bakgrunden";
const PLAY_LABEL = "Spela bakgrunden";

const play = vi.fn<() => Promise<void>>();
const pause = vi.fn<() => void>();

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function setConnection(connection: Record<string, unknown> | undefined) {
  Object.defineProperty(navigator, "connection", {
    value: connection,
    configurable: true,
    writable: true,
  });
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  fireEvent(document, new Event("visibilitychange"));
}

function stubMedia() {
  play.mockReset().mockResolvedValue(undefined);
  pause.mockReset();
  HTMLMediaElement.prototype.play = play;
  HTMLMediaElement.prototype.pause = pause;
  setReducedMotion(false);
  setConnection(undefined);
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
}

describe("PreviewBackdrop — dekoration", () => {
  let observer: FakeIntersectionObserver;

  beforeEach(() => {
    stubMedia();
    observer = installIntersectionObserver({ initial: true });
  });

  afterEach(() => {
    cleanup();
    observer.restore();
    vi.restoreAllMocks();
  });

  it("visar alltid stillbilden och håller lagret utanför fokus- och klickvägen", () => {
    const { container } = render(<PreviewBackdrop motion />);
    const poster = container.querySelector("img");
    expect(poster?.getAttribute("src")).toBe(PREVIEW_BACKDROP_POSTER_URL);
    expect(poster?.getAttribute("alt")).toBe("");
    const decoration = container.querySelector("[aria-hidden='true']");
    expect(decoration?.className).toContain("pointer-events-none");
    expect(container.querySelector("video")?.getAttribute("tabindex")).toBe("-1");
  });

  it("erbjuder båda formaten och laddar inget i förväg", () => {
    const { container } = render(<PreviewBackdrop motion />);
    expect(container.querySelector("video")?.getAttribute("preload")).toBe("none");
    const types = [...container.querySelectorAll("video source")].map((source) =>
      source.getAttribute("type"),
    );
    expect(types).toEqual(["video/webm", "video/mp4"]);
  });
});

describe("PreviewBackdrop — uppspelningspolicy", () => {
  let observer: FakeIntersectionObserver;

  beforeEach(() => {
    stubMedia();
    observer = installIntersectionObserver({ initial: true });
  });

  afterEach(() => {
    cleanup();
    observer.restore();
    vi.restoreAllMocks();
  });

  it("spelar scenen när den behövs", () => {
    render(<PreviewBackdrop motion />);
    expect(play).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: PAUSE_LABEL })).toBeTruthy();
  });

  // En användbar sajt eller ett verkligt fel: stillbilden ligger kvar, men
  // videoelementet monteras aldrig och kan därför inte kosta nedladdning.
  it("monterar ingen video när scenen inte behövs", () => {
    const { container } = render(<PreviewBackdrop motion={false} />);
    expect(container.querySelector("img")).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(play).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: PAUSE_LABEL })).toBeNull();
  });

  it("väljer stillbild vid minskad rörelse utan att starta videoladdningen", () => {
    setReducedMotion(true);
    const { container } = render(<PreviewBackdrop motion />);
    expect(container.querySelector("video")).toBeNull();
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByText("Minskad rörelse: stillbild")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("väljer stillbild i datasparläge", () => {
    setConnection({ saveData: true });
    const { container } = render(<PreviewBackdrop motion />);
    expect(container.querySelector("video")).toBeNull();
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByText("Datasparläge: stillbild")).toBeTruthy();
  });

  it("pausar på användarens begäran och startar igen", () => {
    render(<PreviewBackdrop motion />);
    fireEvent.click(screen.getByRole("button", { name: PAUSE_LABEL }));
    expect(pause).toHaveBeenCalled();
    const resume = screen.getByRole("button", { name: PLAY_LABEL });
    expect(resume.getAttribute("aria-pressed")).toBe("true");
    play.mockClear();
    fireEvent.click(resume);
    expect(play).toHaveBeenCalled();
  });

  // En paus ska frysa den ruta som syns. Om intoningen släpptes vid paus skulle
  // ytan hoppa tillbaka till postern i stället för att stanna.
  it("fryser den synliga rutan vid paus i stället för att falla till postern", () => {
    const { container } = render(<PreviewBackdrop motion />);
    const video = container.querySelector("video")!;
    fireEvent.playing(video);
    const playingClass = video.className;
    fireEvent.click(screen.getByRole("button", { name: PAUSE_LABEL }));
    expect(container.querySelector("video")).toBe(video);
    expect(video.className).toBe(playingClass);
  });

  it("pausar när panelen lämnar viewporten", () => {
    render(<PreviewBackdrop motion />);
    expect(play).toHaveBeenCalled();
    act(() => observer.report(false));
    expect(pause).toHaveBeenCalled();
  });

  it("pausar när fliken göms och återupptar när den syns igen", () => {
    render(<PreviewBackdrop motion />);
    play.mockClear();
    setDocumentHidden(true);
    expect(pause).toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    setDocumentHidden(false);
    expect(play).toHaveBeenCalled();
  });
});

describe("PreviewBackdrop — väntar in viewport", () => {
  let observer: FakeIntersectionObserver;

  beforeEach(() => {
    stubMedia();
    observer = installIntersectionObserver();
  });

  afterEach(() => {
    cleanup();
    observer.restore();
    vi.restoreAllMocks();
  });

  // `preload="none"` gör att inga bytes hämtas förrän `play()` körs, så det här
  // är det testbara beviset för att en panel utanför viewporten inte laddar ner
  // scenen. En riktig IntersectionObserver svarar asynkront efter paint; här
  // svarar den inte alls förrän testet säger till. Blir uppspelningen gissad i
  // stället för inväntad går testet rött på första assertionen.
  it("startar ingen uppspelning förrän observern rapporterat att panelen syns", () => {
    const { container } = render(<PreviewBackdrop motion />);
    expect(container.querySelector("video")).toBeTruthy();
    expect(play).not.toHaveBeenCalled();
    act(() => observer.report(true));
    expect(play).toHaveBeenCalled();
  });
});

describe("PreviewBackdrop — mediafel", () => {
  let observer: FakeIntersectionObserver;

  beforeEach(() => {
    stubMedia();
    observer = installIntersectionObserver({ initial: true });
  });

  afterEach(() => {
    cleanup();
    observer.restore();
    vi.restoreAllMocks();
  });

  it("faller tillbaka till stillbilden utan retry-loop när videon felar", () => {
    const { container } = render(<PreviewBackdrop motion />);
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    fireEvent.error(video!);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("erbjuder en gest när autoplay blockeras", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<PreviewBackdrop motion />);
    const resume = await screen.findByRole("button", { name: PLAY_LABEL });
    play.mockReset().mockResolvedValue(undefined);
    fireEvent.click(resume);
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: PAUSE_LABEL })).toBeTruthy();
  });

  // AbortError = ett nyare play/pause hann före. Det är inte ett block och får
  // inte flippa ytan till "Spela bakgrunden".
  it("behandlar AbortError som en kapplöpning, inte ett autoplay-block", async () => {
    play.mockRejectedValue(new DOMException("aborted", "AbortError"));
    render(<PreviewBackdrop motion />);
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: PAUSE_LABEL })).toBeTruthy();
  });
});
