import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelBrowseGallery } from "./PreviewPanelBrowseGallery";
import type { ComponentCategory } from "@/lib/shadcn/registry-service";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";

/** Insättning där sändvägen faktiskt startade en generation. */
const STARTED_OUTCOME: SendMessageOutcome = { status: "started", via: "stream" };

// Mocka bara de async registry-fetcharna; behåll rena funktioner/konstanter
// (searchBlocks, buildPreviewImageUrl, FEATURED_BLOCKS) äkta så testet täcker
// den verkliga filtreringslogiken.
const { getBlocksByCategory, getComponentsByCategory, fetchCommunityIndexPage } = vi.hoisted(
  () => ({
    getBlocksByCategory: vi.fn(),
    getComponentsByCategory: vi.fn(),
    fetchCommunityIndexPage: vi.fn(),
  }),
);

vi.mock("@/lib/shadcn/registry-service", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/shadcn/registry-service")>();
  return { ...actual, getBlocksByCategory, getComponentsByCategory };
});

vi.mock("@/lib/shadcn/community-registry-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/shadcn/community-registry-client")>();
  return { ...actual, fetchCommunityIndexPage };
});

const BLOCK_CATEGORIES: ComponentCategory[] = [
  {
    id: "authentication",
    label: "Authentication",
    labelSv: "Inloggning",
    icon: "🔐",
    items: [
      {
        name: "login-01",
        title: "Login 01",
        description: "Enkelt inloggningsformulär",
        category: "authentication",
        type: "block",
        lightImageUrl: "https://ui.example/login-01-light.png",
        darkImageUrl: "https://ui.example/login-01-dark.png",
      },
      {
        name: "signup-01",
        title: "Signup 01",
        description: "Registreringsformulär",
        category: "authentication",
        type: "block",
        lightImageUrl: "https://ui.example/signup-01-light.png",
      },
    ],
  },
  {
    id: "charts",
    label: "Charts",
    labelSv: "Diagram",
    icon: "📈",
    items: [
      {
        name: "chart-bar-default",
        title: "Chart Bar Default",
        description: "Stapeldiagram för KPI:er",
        category: "charts",
        type: "block",
        lightImageUrl: "https://ui.example/chart-bar-default-light.png",
      },
    ],
  },
];

describe("PreviewPanelBrowseGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBlocksByCategory.mockResolvedValue(BLOCK_CATEGORIES);
    getComponentsByCategory.mockResolvedValue([]);
    fetchCommunityIndexPage.mockResolvedValue({
      namespace: "@shadcnblocks",
      total: 0,
      categories: [],
      items: [],
      nextCursor: null,
    });
  });

  it("renders block cards from the registry after loading", async () => {
    render(<PreviewPanelBrowseGallery />);

    // Loading-state först
    expect(screen.getByText(/Hämtar galleri/i)).toBeTruthy();

    await waitFor(() => screen.getByText("Login 01"));
    expect(screen.getByText("Signup 01")).toBeTruthy();
    expect(screen.getByText("Chart Bar Default")).toBeTruthy();
    expect(getBlocksByCategory).toHaveBeenCalledTimes(1);
  });

  it("filters cards via the search field (searchBlocks)", async () => {
    render(<PreviewPanelBrowseGallery />);
    await waitFor(() => screen.getByText("Login 01"));

    fireEvent.change(screen.getByLabelText("Sök i galleriet"), {
      target: { value: "chart" },
    });

    expect(screen.getByText("Chart Bar Default")).toBeTruthy();
    expect(screen.queryByText("Login 01")).toBeNull();
    expect(screen.queryByText("Signup 01")).toBeNull();
  });

  it("filters cards via category chips", async () => {
    render(<PreviewPanelBrowseGallery />);
    await waitFor(() => screen.getByText("Login 01"));

    // Klicka på Diagram-kategorin
    fireEvent.click(screen.getByRole("button", { name: /Diagram/ }));

    expect(screen.getByText("Chart Bar Default")).toBeTruthy();
    expect(screen.queryByText("Login 01")).toBeNull();
  });

  it("håller kategorichips i en kompakt scroll-remsa och rutnätet i 3–4 kolumner", async () => {
    render(<PreviewPanelBrowseGallery />);
    await waitFor(() => screen.getByText("Login 01"));

    const strip = screen.getByRole("group", { name: "Kategorier" });
    expect(strip.className).toMatch(/max-h-/);
    expect(strip.className).toMatch(/overflow-y-auto/);

    const grid = screen.getByText("Login 01").closest("button")?.parentElement;
    expect(grid?.className).toMatch(/grid-cols-3/);
    expect(grid?.className).toMatch(/md:grid-cols-4/);
  });

  it("opens a read-only detail view when no insert callback is provided", async () => {
    render(<PreviewPanelBrowseGallery />);
    await waitFor(() => screen.getByText("Login 01"));

    fireEvent.click(screen.getByText("Login 01"));

    // Detaljvyn visar registry/namn + not om att insättning inte är tillgänglig
    expect(screen.getByText("@shadcn/login-01")).toBeTruthy();
    expect(screen.getByText(/Insättning är inte tillgänglig/i)).toBeTruthy();

    // Insättnings-knappen är disabled utan callback och kastar inte
    const insertButton = screen.getByRole("button", { name: /Lägg till i sajten/i });
    expect((insertButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(insertButton);
    expect(screen.getByText("@shadcn/login-01")).toBeTruthy();

    // Tillbaka återgår till galleriet
    fireEvent.click(screen.getByRole("button", { name: /Tillbaka/i }));
    await waitFor(() => screen.getByText("Signup 01"));
  });

  it("kortval → onInsertItem med registry-metadata (insättnings-lane v1, Fas 2)", async () => {
    const onInsertItem = vi.fn().mockResolvedValue(STARTED_OUTCOME);
    render(<PreviewPanelBrowseGallery onInsertItem={onInsertItem} />);
    await waitFor(() => screen.getByText("Login 01"));

    fireEvent.click(screen.getByText("Login 01"));

    const insertButton = screen.getByRole("button", { name: /Lägg till i sajten/i });
    expect((insertButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(insertButton);

    await waitFor(() =>
      expect(onInsertItem).toHaveBeenCalledWith({
        name: "login-01",
        registry: "@shadcn",
        title: "Login 01",
        description: "Enkelt inloggningsformulär",
        origin: "browse",
      }),
    );
    // Startad generation bekräftas i detaljvyn.
    await waitFor(() => screen.getByText(/Skickat till chatten/i));
  });

  it("klick-väg väntar på onPickPlacement och skickar placeringsankare med onInsertItem", async () => {
    const onInsertItem = vi.fn().mockResolvedValue(STARTED_OUTCOME);
    let resolvePick!: (value: {
      placement: string;
      placementLabel: string;
      anchorSectionLabel?: string;
    } | null) => void;
    const onPickPlacement = vi.fn(
      () =>
        new Promise<{
          placement: string;
          placementLabel: string;
          anchorSectionLabel?: string;
        } | null>((resolve) => {
          resolvePick = resolve;
        }),
    );

    render(
      <PreviewPanelBrowseGallery
        onInsertItem={onInsertItem}
        onPickPlacement={onPickPlacement}
      />,
    );
    await waitFor(() => screen.getByText("Login 01"));
    fireEvent.click(screen.getByText("Login 01"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till i sajten/i }));

    await waitFor(() => expect(onPickPlacement).toHaveBeenCalledTimes(1));
    expect(onInsertItem).not.toHaveBeenCalled();

    resolvePick({
      placement: "after-hero",
      placementLabel: "Efter Hero",
      anchorSectionLabel: "Hero",
    });

    await waitFor(() =>
      expect(onInsertItem).toHaveBeenCalledWith({
        name: "login-01",
        registry: "@shadcn",
        title: "Login 01",
        description: "Enkelt inloggningsformulär",
        origin: "browse",
        placement: "after-hero",
        placementLabel: "Efter Hero",
        anchorSectionLabel: "Hero",
      }),
    );
    await waitFor(() => screen.getByText(/Skickat till chatten/i));
  });

  it("anropar onCloseBeforeInsert innan onPickPlacement så overlayn hinner bort", async () => {
    const order: string[] = [];
    const onCloseBeforeInsert = vi.fn(() => {
      order.push("close");
    });
    const onPickPlacement = vi.fn(async () => {
      order.push("pick");
      return {
        placement: "after-hero",
        placementLabel: "Efter Hero",
        anchorSectionLabel: "Hero",
      };
    });
    const onInsertItem = vi.fn(async () => {
      order.push("insert");
      return STARTED_OUTCOME;
    });

    render(
      <PreviewPanelBrowseGallery
        onInsertItem={onInsertItem}
        onPickPlacement={onPickPlacement}
        onCloseBeforeInsert={onCloseBeforeInsert}
      />,
    );
    await waitFor(() => screen.getByText("Login 01"));
    fireEvent.click(screen.getByText("Login 01"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till i sajten/i }));

    await waitFor(() => expect(onInsertItem).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["close", "pick", "insert"]);
  });

  it("Esc/avbruten placement-pick → onInsertItem utan ankare (default längst ner)", async () => {
    const onInsertItem = vi.fn().mockResolvedValue(STARTED_OUTCOME);
    const onPickPlacement = vi.fn().mockResolvedValue(null);

    render(
      <PreviewPanelBrowseGallery
        onInsertItem={onInsertItem}
        onPickPlacement={onPickPlacement}
      />,
    );
    await waitFor(() => screen.getByText("Login 01"));
    fireEvent.click(screen.getByText("Login 01"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till i sajten/i }));

    await waitFor(() =>
      expect(onInsertItem).toHaveBeenCalledWith({
        name: "login-01",
        registry: "@shadcn",
        title: "Login 01",
        description: "Enkelt inloggningsformulär",
        origin: "browse",
      }),
    );
    expect(onInsertItem.mock.calls[0]?.[0]?.placement).toBeUndefined();
  });

  // Utfallskontraktet (BB#shadcn-lane1): ett hanterat avslag resolvar utan kast,
  // så före kontraktet visade detaljvyn "Skickat" för en insättning som aldrig
  // startade någon generation.
  it("markerar ALDRIG detaljvyn som skickad vid ett hanterat avslag", async () => {
    const onInsertItem = vi.fn().mockResolvedValue({
      status: "rejected",
      reason: "tier3_env_not_ready",
      turnRecorded: true,
    } satisfies SendMessageOutcome);
    render(<PreviewPanelBrowseGallery onInsertItem={onInsertItem} />);
    await waitFor(() => screen.getByText("Login 01"));

    fireEvent.click(screen.getByText("Login 01"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till i sajten/i }));

    await waitFor(() => expect(onInsertItem).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Skickat till chatten/i)).toBeNull();
  });

  it("markerar ALDRIG detaljvyn som skickad när insättningen misslyckas", async () => {
    const onInsertItem = vi.fn().mockRejectedValue(new Error("send failed"));
    render(<PreviewPanelBrowseGallery onInsertItem={onInsertItem} />);
    await waitFor(() => screen.getByText("Login 01"));

    fireEvent.click(screen.getByText("Login 01"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till i sajten/i }));

    await waitFor(() => expect(onInsertItem).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Skickat till chatten/i)).toBeNull();
  });

  it("shows an error state with retry when the fetch rejects", async () => {
    getBlocksByCategory.mockReset();
    getBlocksByCategory
      .mockRejectedValueOnce(new Error("Kunde inte hämta registry-index (HTTP 500)"))
      .mockResolvedValueOnce(BLOCK_CATEGORIES);

    render(<PreviewPanelBrowseGallery />);

    await waitFor(() => screen.getByText(/Kunde inte hämta registry-index/i));

    fireEvent.click(screen.getByRole("button", { name: /Försök igen/i }));

    await waitFor(() => screen.getByText("Login 01"));
  });

  it("kort är inte draggbara i overlay-läget även när insättning är möjlig", async () => {
    const onInsertItem = vi.fn();
    render(<PreviewPanelBrowseGallery onInsertItem={onInsertItem} />);
    await waitFor(() => screen.getByText("Login 01"));

    const card = screen.getByText("Login 01").closest("button");
    expect(card?.getAttribute("draggable")).toBe("false");
  });

  it("kort är INTE draggbara utan insert-callback (read-only-läge)", async () => {
    render(<PreviewPanelBrowseGallery />);
    await waitFor(() => screen.getByText("Login 01"));

    const card = screen.getByText("Login 01").closest("button");
    expect(card?.getAttribute("draggable")).toBe("false");
  });

  it("trasig thumbnail degraderar till ikon-platshållare (onError)", async () => {
    render(<PreviewPanelBrowseGallery />);
    await waitFor(() => screen.getByText("Login 01"));

    const img = screen.getByAltText("Login 01");
    fireEvent.error(img);

    // Bilden byts mot platshållare — ingen bruten <img> lämnas kvar.
    expect(screen.queryByAltText("Login 01")).toBeNull();
  });

  it("switches to components via the itemType tab", async () => {
    getComponentsByCategory.mockResolvedValue([
      {
        id: "forms",
        label: "Forms",
        labelSv: "Formulär",
        icon: "📝",
        items: [
          {
            name: "button",
            title: "Button",
            description: "Knapp-primitiv",
            category: "forms",
            type: "component",
          },
        ],
      },
    ] satisfies ComponentCategory[]);

    render(<PreviewPanelBrowseGallery />);
    await waitFor(() => screen.getByText("Login 01"));

    fireEvent.click(screen.getByRole("button", { name: /^Komponenter$/ }));

    await waitFor(() => screen.getByText("Button"));
    expect(getComponentsByCategory).toHaveBeenCalled();
  });

  it("Marknadsblock-källa stampelar @shadcnblocks och hydrerar via community-index", async () => {
    fetchCommunityIndexPage.mockResolvedValue({
      namespace: "@shadcnblocks",
      total: 1,
      categories: [{ id: "hero", label: "Hero", count: 1 }],
      items: [
        {
          name: "hero1",
          type: "registry:block",
          title: "Hero 1 - Split hero",
          description: "A two-column hero",
          category: "hero",
        },
      ],
      nextCursor: null,
    });

    const onInsertItem = vi.fn().mockResolvedValue(STARTED_OUTCOME);
    render(<PreviewPanelBrowseGallery onInsertItem={onInsertItem} />);
    await waitFor(() => screen.getByText("Login 01"));

    fireEvent.click(screen.getByRole("button", { name: /^Marknadsblock$/ }));
    await waitFor(() => screen.getByText("Hero 1 - Split hero"));
    expect(fetchCommunityIndexPage).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Hero 1 - Split hero"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till i sajten/i }));

    await waitFor(() =>
      expect(onInsertItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "hero1",
          registry: "@shadcnblocks",
          title: "Hero 1 - Split hero",
          origin: "browse",
          addCommand: "npx shadcn@latest add @shadcnblocks/hero1",
        }),
      ),
    );
  });

  it("en föråldrad Visa fler nollar inte spinnern för en nyare hämtning", async () => {
    let resolveStaleLoadMore: (value: unknown) => void = () => {};
    const heroItem = {
      name: "hero1",
      type: "registry:block",
      title: "Hero 1 - Split hero",
      description: "A two-column hero",
      category: "hero",
    };
    const pricingItem = {
      name: "pricing1",
      type: "registry:block",
      title: "Pricing 1",
      description: "Pricing table",
      category: "pricing",
    };
    const categories = [
      { id: "hero", label: "Hero", count: 2 },
      { id: "pricing", label: "Prissättning", count: 2 },
    ];

    fetchCommunityIndexPage.mockImplementation(
      (query: { cursor?: string | null; category?: string }) => {
        if (query.cursor && !query.category) {
          return new Promise((resolve) => {
            resolveStaleLoadMore = resolve;
          });
        }
        if (!query.cursor && !query.category) {
          return Promise.resolve({
            namespace: "@shadcnblocks",
            total: 4,
            categories,
            items: [heroItem],
            nextCursor: "page-2",
          });
        }
        if (!query.cursor && query.category === "pricing") {
          return Promise.resolve({
            namespace: "@shadcnblocks",
            total: 2,
            categories,
            items: [pricingItem],
            nextCursor: "pricing-2",
          });
        }
        if (query.cursor === "pricing-2") {
          return new Promise(() => {});
        }
        return Promise.resolve({
          namespace: "@shadcnblocks",
          total: 0,
          categories: [],
          items: [],
          nextCursor: null,
        });
      },
    );

    render(<PreviewPanelBrowseGallery />);
    fireEvent.click(screen.getByRole("button", { name: /^Marknadsblock$/ }));
    await waitFor(() => screen.getByText("Hero 1 - Split hero"));

    fireEvent.click(screen.getByRole("button", { name: /Visa fler/i }));
    await waitFor(() => {
      expect((screen.getByRole("button", { name: /Visa fler/i }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Prissättning/ }));
    await waitFor(() => screen.getByText("Pricing 1"));
    expect(screen.queryByText("Hero 1 - Split hero")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Visa fler/i }));
    await waitFor(() => {
      expect((screen.getByRole("button", { name: /Visa fler/i }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    resolveStaleLoadMore({
      namespace: "@shadcnblocks",
      total: 4,
      categories,
      items: [{ ...heroItem, name: "hero2", title: "Hero 2" }],
      nextCursor: "page-3",
    });

    await waitFor(() => {
      expect(screen.queryByText("Hero 2")).toBeNull();
    });
    expect((screen.getByRole("button", { name: /Visa fler/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("Pricing 1")).toBeTruthy();
  });
});
