import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelDescribeTab } from "./PreviewPanelDescribeTab";

/**
 * "Beskriv"-fliken (Fas 2 v1 + Fas 3): fritext → POST /api/shadcn/describe →
 * rankade kandidatkort → välj → `onInsertItem` (insättnings-lane v1).
 * Describe-fetchen mockas — testet täcker UI-tillstånd + val-payloaden.
 */

const CANDIDATES = [
  {
    name: "chart-bar-interactive",
    registry: "@shadcn",
    title: "Bar Chart Interactive",
    description: "An interactive bar chart",
    previewLight: "https://ui.example/chart-bar-interactive-light.png",
    dependencies: ["recharts"],
    registryDependencies: ["card", "chart"],
    addCommand: "npx shadcn@latest add chart-bar-interactive",
    reason: "matchar stapel-graf med försäljning",
  },
  {
    name: "hero1",
    registry: "@shadcnblocks",
    description: "Hero section",
    addCommand: "npx shadcn@latest add @shadcnblocks/hero1",
  },
];

function mockDescribeFetch(response: {
  ok?: boolean;
  status?: number;
  candidates?: unknown[];
}) {
  const { ok = true, status = 200, candidates = CANDIDATES } = response;
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => ({ candidates }),
  });
}

async function searchFor(text: string) {
  fireEvent.change(screen.getByLabelText("Beskriv vad du vill lägga till"), {
    target: { value: text },
  });
  // Flusha fetch-fortsättningen inom act så state-uppdateringarna inte
  // landar utanför Reacts testkuvert (act-varningar).
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Hitta block/i }));
    await Promise.resolve();
  });
}

describe("PreviewPanelDescribeTab", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("söker via /api/shadcn/describe och visar rankade kandidatkort", async () => {
    const fetchMock = mockDescribeFetch({});
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PreviewPanelDescribeTab onInsertItem={vi.fn()} />);
    await searchFor("en stapel-graf som mäter försäljning");

    await waitFor(() => screen.getByText("Bar Chart Interactive"));
    expect(screen.getByText("hero1")).toBeTruthy();
    expect(screen.getByText(/matchar stapel-graf/i)).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shadcn/describe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ description: "en stapel-graf som mäter försäljning" }),
      }),
    );
  });

  it("kortval anropar onInsertItem med kandidatens metadata (origin describe)", async () => {
    global.fetch = mockDescribeFetch({}) as unknown as typeof fetch;
    const onInsertItem = vi.fn().mockResolvedValue(undefined);

    render(<PreviewPanelDescribeTab onInsertItem={onInsertItem} />);
    await searchFor("stapel-graf");
    await waitFor(() => screen.getByText("Bar Chart Interactive"));

    const buttons = screen.getAllByRole("button", { name: /Lägg till i sajten/i });
    fireEvent.click(buttons[0]);

    await waitFor(() =>
      expect(onInsertItem).toHaveBeenCalledWith({
        name: "chart-bar-interactive",
        registry: "@shadcn",
        title: "Bar Chart Interactive",
        description: "An interactive bar chart",
        dependencies: ["recharts"],
        registryDependencies: ["card", "chart"],
        addCommand: "npx shadcn@latest add chart-bar-interactive",
        origin: "describe",
      }),
    );
    // Lyckad insättning bekräftas på kortet.
    await waitFor(() => screen.getByText(/Skickad — följ genereringen/i));
  });

  it("markerar ALDRIG kortet som skickat när insättningen misslyckas", async () => {
    global.fetch = mockDescribeFetch({}) as unknown as typeof fetch;
    const onInsertItem = vi.fn().mockRejectedValue(new Error("send failed"));

    render(<PreviewPanelDescribeTab onInsertItem={onInsertItem} />);
    await searchFor("stapel-graf");
    await waitFor(() => screen.getByText("Bar Chart Interactive"));

    fireEvent.click(screen.getAllByRole("button", { name: /Lägg till i sajten/i })[0]);

    await waitFor(() => expect(onInsertItem).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Skickad — följ genereringen/i)).toBeNull();
  });

  it("visar flagg-av-budskap när routen svarar 404", async () => {
    global.fetch = mockDescribeFetch({ ok: false, status: 404 }) as unknown as typeof fetch;

    render(<PreviewPanelDescribeTab onInsertItem={vi.fn()} />);
    await searchFor("stapel-graf");

    await waitFor(() => screen.getByText(/inte aktiverat i den här miljön/i));
  });

  it("visar login-budskap vid 401", async () => {
    global.fetch = mockDescribeFetch({ ok: false, status: 401 }) as unknown as typeof fetch;

    render(<PreviewPanelDescribeTab onInsertItem={vi.fn()} />);
    await searchFor("stapel-graf");

    await waitFor(() => screen.getByText(/Logga in för att använda Beskriv/i));
  });

  it("visar tom-träffar-läge när inga kandidater hittas", async () => {
    global.fetch = mockDescribeFetch({ candidates: [] }) as unknown as typeof fetch;

    render(<PreviewPanelDescribeTab onInsertItem={vi.fn()} />);
    await searchFor("obskyr beskrivning utan träffar");

    await waitFor(() => screen.getByText(/Inga träffar/i));
  });
});
