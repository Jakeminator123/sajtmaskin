import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MediaDrawer } from "./media-drawer";

afterEach(() => vi.unstubAllGlobals());

it("opens Skapa video in the ordinary media bank without placing an order", async () => {
  const fetchMock = vi.fn(async (input: string) => input.startsWith("/api/media/video-generations?")
    ? Response.json({ enabled: true, quote: { credits: 18, durationSeconds: 5, model: "gen4_turbo" }, jobs: [] })
    : Response.json({ success: true, projectId: "site-a", items: [], counts: { images: 0, videos: 0, other: 0 } }));
  vi.stubGlobal("fetch", fetchMock);
  render(<MediaDrawer isOpen projectId="site-a" onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Skapa video" }));
  const order = await screen.findByRole<HTMLButtonElement>("button", { name: "Beställ video för 18 krediter" });
  expect(order.disabled).toBe(true);
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/media/video-generations?projectId=site-a");
});

it.each(["POST", "DELETE"])("refreshes the current project and filter when a delayed %s completes", async (method) => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    if (init?.method === method) return pending;
    const params = new URL(input, "http://localhost").searchParams;
    const name = `${params.get("projectId")}-${params.get("fileType") ?? "all"}.png`;
    return Promise.resolve(Response.json({
      success: true, counts: { images: 1, videos: 0, other: 0 },
      items: [{ id: 1, filename: name, fileType: "image", url: `https://example.org/${name}`,
        createdAt: "2026-01-01", mimeType: "image/png" }],
    }));
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", () => true);
  const onClose = () => {};
  const view = render(<MediaDrawer isOpen projectId="first" onClose={onClose} />);
  const first = await screen.findByAltText("first-all.png");
  if (method === "POST") {
    fireEvent.change(screen.getByLabelText("Välj filer att ladda upp"), {
      target: { files: [new File(["png"], "old.png", { type: "image/png" })] },
    });
  } else {
    fireEvent.mouseEnter(first.parentElement!);
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
  }
  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === method)).toBe(true));

  view.rerender(<MediaDrawer isOpen projectId="second" onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Bilder" }));
  await screen.findByAltText("second-image.png");
  const before = fetchMock.mock.calls.length;
  await act(async () => finish(Response.json({ success: true, media: { id: 7 } })));
  await waitFor(() => {
    expect(fetchMock.mock.calls.slice(before).map(([input]) => input))
      .toEqual(["/api/media/upload?fileType=image&projectId=second"]);
  });
  expect(screen.queryByAltText("first-all.png")).toBeNull();
});

it("shows the site's own quota while reusing personal or other site images", async () => {
  const assets = [
    { id: 1, projectId: null, filename: "tidigare.png", url: "https://example.org/old.png" },
    { id: 2, projectId: "other-site", filename: "annansajt.png", url: "https://example.org/other.png" },
  ].map((asset) => ({
    ...asset, mimeType: "image/png", fileType: "image", size: 100, createdAt: "2026-01-01",
  }));
  const fetchMock = vi.fn().mockResolvedValue(Response.json({
    success: true, items: assets, counts: { images: 198, videos: 3, other: 0 },
  }));
  vi.stubGlobal("fetch", fetchMock);
  const onFileSelect = vi.fn();
  render(<MediaDrawer isOpen projectId="current-site" onClose={() => {}} onFileSelect={onFileSelect} />);
  await screen.findByText("Sajtens bilder och logotyper 198/200");
  expect(screen.getByText("Kontots videor 3/3")).toBeTruthy();
  fireEvent.click(screen.getByAltText("tidigare.png"));
  fireEvent.click(screen.getByAltText("annansajt.png"));
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/media/upload?projectId=current-site", expect.any(Object));
  expect(onFileSelect.mock.calls.map(([item]) => item.id)).toEqual(["media-1", "media-2"]);
});
