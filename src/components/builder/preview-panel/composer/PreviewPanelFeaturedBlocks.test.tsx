import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelFeaturedBlocks } from "./PreviewPanelFeaturedBlocks";
import type { CommunityIndexPage } from "@/lib/shadcn/community-registry-catalog";

/**
 * Regressionsskydd för felytan i Block-fliken.
 *
 * `items` initialiseras med de åtta fröna och är därför ALDRIG tom, och en
 * frö-post går att sätta in (bara namn/titel/kategori behövs). Ett
 * hämtningsfel fick tidigare ersätta hela listan, vilket dolde åtta
 * fungerande kort. Felet hör i stället i rubrikytan, vid sidan av listan.
 */
const { fetchFeaturedShadcnblocks } = vi.hoisted(() => ({
  fetchFeaturedShadcnblocks: vi.fn(),
}));

vi.mock("@/lib/shadcn/community-registry-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/shadcn/community-registry-client")>();
  return { ...actual, fetchFeaturedShadcnblocks };
});

const ENRICHED_PAGE: CommunityIndexPage = {
  items: [
    {
      name: "hero1",
      type: "registry:block",
      title: "Hero från registret",
      description: "Uppslagen titel",
      category: "hero",
    },
  ],
} as CommunityIndexPage;

describe("PreviewPanelFeaturedBlocks felyta", () => {
  beforeEach(() => {
    fetchFeaturedShadcnblocks.mockReset();
  });

  it("visar felet UTAN att gömma de åtta fröna när hämtningen misslyckas", async () => {
    fetchFeaturedShadcnblocks.mockRejectedValue(new Error("Registret svarade 503"));

    render(<PreviewPanelFeaturedBlocks />);

    await waitFor(() => {
      expect(screen.getByText("Registret svarade 503")).toBeTruthy();
    });

    // Kortlistan ska finnas kvar — det var precis den som försvann förut.
    // Etiketten renderas både som korttitel och sektionsetikett, så räkna korten.
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getAllByText("Sidfot").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeTruthy();
  });

  it("rensar felet och visar registrets titlar efter lyckad omhämtning", async () => {
    fetchFeaturedShadcnblocks
      .mockRejectedValueOnce(new Error("Registret svarade 503"))
      .mockResolvedValueOnce(ENRICHED_PAGE);

    render(<PreviewPanelFeaturedBlocks />);

    await waitFor(() => {
      expect(screen.getByText("Registret svarade 503")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));

    await waitFor(() => {
      expect(screen.getByText("Hero från registret")).toBeTruthy();
    });
    expect(screen.queryByText("Registret svarade 503")).toBeNull();
    expect(screen.queryByRole("button", { name: "Försök igen" })).toBeNull();
  });
});
