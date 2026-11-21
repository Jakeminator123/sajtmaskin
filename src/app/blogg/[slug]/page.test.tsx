// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import BlogPostPage from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));

const renderPost = async (slug: string) =>
  render(await BlogPostPage({ params: Promise.resolve({ slug }) }));

describe("/blogg/[slug]", () => {
  it("links the AI checklist to the product page right under the excerpt", async () => {
    await renderPost("skapa-hemsida-med-ai-sa-funkar-det");
    expect(
      screen.getByRole("heading", { level: 1, name: "Hemsida med AI: checklista före, under och efter" }),
    ).toBeTruthy();
    const lead = screen.getByText(/Vill du se hur själva verktyget fungerar/);
    const link = lead.querySelector("a");
    expect(link?.textContent).toBe("Skapa hemsida med AI");
    expect(link?.getAttribute("href")).toBe("/skapa-hemsida-med-ai");
  });

  it("renders posts without a lead as before", async () => {
    await renderPost("hemsida-enskild-firma");
    expect(screen.queryByText(/Vill du se hur själva verktyget fungerar/)).toBeNull();
  });
});
