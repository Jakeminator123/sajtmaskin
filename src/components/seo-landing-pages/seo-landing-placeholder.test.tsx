// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SeoLandingPlaceholder } from "./seo-landing-placeholder";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("SeoLandingPlaceholder", () => {
  it("renders the shared test heading, slug and product CTA", () => {
    render(<SeoLandingPlaceholder slug="skapa-hemsida-med-ai" />);

    expect(screen.getByRole("heading", { level: 1, name: "Testsida Sajtmaskin" })).toBeTruthy();
    expect(
      screen.getByText("Skapa hemsida med AI – från beskrivning till första version"),
    ).toBeTruthy();
    expect(screen.getByText("/skapa-hemsida-med-ai")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Skapa hemsida" })[0]?.getAttribute("href")).toBe(
      "/builder?new=1",
    );
    expect(screen.getByRole("link", { name: "Öppna Sajtmaskin" }).getAttribute("href")).toBe(
      "/builder?new=1",
    );
  });
});
