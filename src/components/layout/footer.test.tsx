import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./footer";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("Footer", () => {
  it("uses Swedish about route and privacy anchors for legal links", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "Om oss" }).getAttribute("href")).toBe("/om");
    expect(screen.getByRole("link", { name: "Integritetspolicy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Användarvillkor" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "GDPR" }).getAttribute("href")).toBe("/privacy#gdpr");
    expect(screen.getByRole("link", { name: "Cookies" }).getAttribute("href")).toBe("/privacy#cookies");
  });

  it("exposes a discrete Guider section into the SEO cluster", () => {
    render(<Footer />);

    expect(screen.getByRole("heading", { name: "Guider" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Så skapar du en hemsida" }).getAttribute("href")).toBe(
      "/skapa-hemsida",
    );
    expect(screen.getByRole("link", { name: "Vad en hemsida kostar" }).getAttribute("href")).toBe(
      "/vad-kostar-en-hemsida",
    );
    expect(screen.getByRole("link", { name: "Jämför hemsideprogram" }).getAttribute("href")).toBe(
      "/hemsideprogram",
    );
  });

  it("exposes a Jämför section into the comparison landings", () => {
    render(<Footer />);

    expect(screen.getByRole("heading", { name: "Jämför" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wix-alternativ" }).getAttribute("href")).toBe(
      "/wix-alternativ",
    );
    expect(screen.getByRole("link", { name: "WordPress-alternativ" }).getAttribute("href")).toBe(
      "/wordpress-alternativ",
    );
    expect(screen.getByRole("link", { name: "Lovable-alternativ" }).getAttribute("href")).toBe(
      "/lovable-alternativ",
    );
    expect(screen.getByRole("link", { name: "AI-hemsidebyggare" }).getAttribute("href")).toBe(
      "/ai-hemsidebyggare",
    );
  });
});
