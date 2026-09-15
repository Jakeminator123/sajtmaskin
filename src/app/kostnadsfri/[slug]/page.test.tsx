// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getKostnadsfriPageBySlug = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/kostnadsfri", () => ({
  getKostnadsfriPageBySlug,
}));

vi.mock("@/components/kostnadsfri/kostnadsfri-page", () => ({
  KostnadsfriPage: ({ slug, companyName }: { slug: string; companyName: string }) => (
    <div>{`landning ${slug} ${companyName}`}</div>
  ),
}));

import KostnadsfriSlugPage from "./page";

describe("kostnadsfri landing page", () => {
  it("visar utgången länk när syskonraden är expired", async () => {
    getKostnadsfriPageBySlug.mockImplementation(async (candidate: string) =>
      candidate === "zax-2-0-ab"
        ? { slug: "zax-2-0-ab", company_name: "Zax 2.0 AB", status: "expired", expires_at: null }
        : null,
    );

    const ui = await KostnadsfriSlugPage({ params: Promise.resolve({ slug: "zax-2-0" }) });
    render(ui);

    expect(screen.getByText("Länken har gått ut")).toBeTruthy();
  });

  it("tar bolagsnamnet från syskonraden när URL-en saknar -ab", async () => {
    getKostnadsfriPageBySlug.mockImplementation(async (candidate: string) =>
      candidate === "zax-2-0-ab"
        ? {
            slug: "zax-2-0-ab",
            company_name: "Zax 2.0 AB",
            status: "active",
            expires_at: null,
            extra_data: null,
          }
        : null,
    );

    const ui = await KostnadsfriSlugPage({ params: Promise.resolve({ slug: "zax-2-0" }) });
    render(ui);

    expect(screen.getByText("landning zax-2-0 Zax 2.0 AB")).toBeTruthy();
  });
});
