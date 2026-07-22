import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelBrowseGallery } from "./PreviewPanelBrowseGallery";
import type { ComponentCategory } from "@/lib/shadcn/registry-service";

// Mocka bara de async registry-fetcharna; behåll rena funktioner/konstanter
// (searchBlocks, buildPreviewImageUrl, FEATURED_BLOCKS) äkta så testet täcker
// den verkliga filtreringslogiken.
const { getBlocksByCategory, getComponentsByCategory } = vi.hoisted(() => ({
  getBlocksByCategory: vi.fn(),
  getComponentsByCategory: vi.fn(),
}));

vi.mock("@/lib/shadcn/registry-service", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/shadcn/registry-service")>();
  return { ...actual, getBlocksByCategory, getComponentsByCategory };
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

  it("opens a no-op detail view on card click (insertion not wired in Fas 3)", async () => {
    render(<PreviewPanelBrowseGallery />);
    await waitFor(() => screen.getByText("Login 01"));

    fireEvent.click(screen.getByText("Login 01"));

    // Detaljvyn visar block-namnet + not om senare fas
    expect(screen.getByText("login-01")).toBeTruthy();
    expect(screen.getByText(/Insättning kommer i en senare fas/i)).toBeTruthy();

    // Insättnings-knappen är disabled (no-op tills Fas 2) och kastar inte
    const insertButton = screen.getByRole("button", { name: /Lägg till i sajten/i });
    expect((insertButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(insertButton);
    expect(screen.getByText("login-01")).toBeTruthy();

    // Tillbaka återgår till galleriet
    fireEvent.click(screen.getByRole("button", { name: /Tillbaka/i }));
    await waitFor(() => screen.getByText("Signup 01"));
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
});
