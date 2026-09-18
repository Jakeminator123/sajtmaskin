// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  EXEMPEL_BUILDER_HREF,
  EXEMPEL_DISCLOSURE,
  EXEMPEL_SECONDARY_HREF,
  SHOWCASE_EXTERNAL_REL,
  SHOWCASE_SITES,
} from "@/lib/exempel/showcase-sites";

const FORBIDDEN_GLASS_ALIAS = "https://glass-showcase.vercel.app";
import { ExempelContent } from "./exempel-content";

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

describe("ExempelContent", () => {
  it("renders one H1, a reconstruction disclosure and five real showcase cards", () => {
    const { container } = render(<ExempelContent />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Hemsidor och idéer byggda som Sajtmaskin-exempel");
    expect(screen.getByText(EXEMPEL_DISCLOSURE)).toBeTruthy();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).not.toMatch(/kundcase/i);

    const external = [...container.querySelectorAll('a[href^="http"]')];
    expect(external).toHaveLength(SHOWCASE_SITES.length);
    for (const [index, site] of SHOWCASE_SITES.entries()) {
      expect(screen.getByRole("heading", { level: 3, name: site.name })).toBeTruthy();
      expect(external[index]?.getAttribute("href")).toBe(site.href);
      expect(external[index]?.getAttribute("rel")).toBe(SHOWCASE_EXTERNAL_REL);
      expect(external[index]?.getAttribute("target")).toBe("_blank");
      expect(
        screen.getByRole("link", { name: new RegExp(`Öppna ${site.name}`) }),
      ).toBeTruthy();
    }
    expect(container.innerHTML).not.toContain(FORBIDDEN_GLASS_ALIAS);
  });

  it("keeps builder as the primary CTA and the AI landing as a secondary path", () => {
    render(<ExempelContent />);

    const builderLinks = screen.getAllByRole("link", { name: /Skapa din egen sajt|Öppna byggaren/ });
    expect(builderLinks.length).toBeGreaterThan(0);
    expect(builderLinks.every((link) => link.getAttribute("href") === EXEMPEL_BUILDER_HREF)).toBe(
      true,
    );

    const secondary = screen.getAllByRole("link", { name: /AI/i });
    expect(secondary).toHaveLength(2);
    expect(secondary.every((link) => link.getAttribute("href") === EXEMPEL_SECONDARY_HREF)).toBe(
      true,
    );
  });
});
