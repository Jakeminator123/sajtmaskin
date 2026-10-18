// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPARISON_COPY } from "./comparison-copy";
import { ComparisonLandingContent } from "./comparison-landing";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const PRICE_SENTENCE = /aktuella (?:sajtmaskin-)?paket finns på prissidan/gi;

afterEach(() => {
  cleanup();
});

describe("comparison landing price sentence", () => {
  it.each(Object.keys(COMPARISON_COPY) as Array<keyof typeof COMPARISON_COPY>)(
    "mentions the price page exactly once on %s",
    (slug) => {
      render(<ComparisonLandingContent slug={slug} />);
      const body = document.body.textContent ?? "";
      expect(body.match(PRICE_SENTENCE) ?? []).toHaveLength(1);
    },
  );
});
