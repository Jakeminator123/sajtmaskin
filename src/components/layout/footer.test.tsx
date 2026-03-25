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
});
