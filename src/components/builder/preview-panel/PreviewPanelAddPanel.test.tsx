import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelAddPanel } from "./PreviewPanelAddPanel";
import type { ComponentCategory } from "@/lib/shadcn/registry-service";

// Mocka registry-fetcharna (används av "Bläddra"-fliken). Övriga rena
// funktioner/konstanter behålls äkta.
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
      },
    ],
  },
];

describe("PreviewPanelAddPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBlocksByCategory.mockResolvedValue(BLOCK_CATEGORIES);
    getComponentsByCategory.mockResolvedValue([]);
  });

  it("defaults to the Block tab with the composer blocks (no registry fetch)", () => {
    render(<PreviewPanelAddPanel />);

    // Ett av de 8 Composer-blocken syns
    expect(screen.getByText("Enkel hero")).toBeTruthy();
    // Bläddra har inte hämtat något förrän fliken öppnas
    expect(getBlocksByCategory).not.toHaveBeenCalled();
  });

  it("switches to the Bläddra gallery and fetches registry data", async () => {
    render(<PreviewPanelAddPanel />);

    fireEvent.click(screen.getByRole("tab", { name: /Bläddra/ }));

    await waitFor(() => screen.getByText("Login 01"));
    expect(getBlocksByCategory).toHaveBeenCalledTimes(1);
  });

  it("shows the Beskriv 'kommer snart' placeholder (not a broken empty tab)", () => {
    render(<PreviewPanelAddPanel />);

    fireEvent.click(screen.getByRole("tab", { name: /Beskriv/ }));

    expect(screen.getByText(/kommer snart/i)).toBeTruthy();
  });
});
