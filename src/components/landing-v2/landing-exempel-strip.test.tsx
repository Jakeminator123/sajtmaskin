// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { EXEMPEL_PATH, HOME_SHOWCASE_SITES } from "@/lib/exempel/showcase-sites";
import { LandingExempelStrip } from "./landing-exempel-strip";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

describe("LandingExempelStrip", () => {
  it("shows three featured reconstructions and points at /exempel", () => {
    const { container } = render(<LandingExempelStrip />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/riktningar/i);
    expect(screen.getByRole("link", { name: "Alla exempel" }).getAttribute("href")).toBe(
      EXEMPEL_PATH,
    );
    for (const site of HOME_SHOWCASE_SITES) {
      expect(screen.getByText(site.name)).toBeTruthy();
    }
    expect(container.textContent).toMatch(/inte kundcase/i);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getAllByRole("link").every((link) => link.getAttribute("href") === EXEMPEL_PATH)).toBe(
      true,
    );
  });
});
