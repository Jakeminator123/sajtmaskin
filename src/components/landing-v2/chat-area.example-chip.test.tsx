// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="dynamic-stub" />,
}));
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));
vi.mock("@/components/forms/voice-recorder", () => ({
  VoiceRecorder: () => null,
}));
vi.mock("@/components/landing-v2/lanyard-consent", () => ({
  preloadReturningLanyard: () => {},
}));
vi.mock("sonner", () => ({ toast: { message: vi.fn(), error: vi.fn() } }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import { ChatArea } from "./chat-area";

function AuditExampleHarness() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>("audit");
  return (
    <ChatArea
      selectedCategory={selectedCategory}
      onSelectedCategoryChange={setSelectedCategory}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChatArea example chips", () => {
  it("from audit mode waits for the freeform textarea, then focuses and scrolls it", async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    const scrollTo = vi.spyOn(Element.prototype, "scrollTo");

    render(<AuditExampleHarness />);

    expect(document.querySelector('[data-openclaw-text-target="landing.audit.url"]')).toBeTruthy();
    expect(
      document.querySelector('[data-openclaw-text-target="landing.freeform.primary"]'),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Frisörsajt" }));

    const textarea = await waitFor(() => {
      const field = document.querySelector<HTMLTextAreaElement>(
        '[data-openclaw-text-target="landing.freeform.primary"]',
      );
      expect(field).toBeTruthy();
      expect(field?.value).toBe("Jag vill ha en frisörsajt");
      expect(document.activeElement).toBe(field);
      return field!;
    });

    const scrollContainer = document.querySelector("[data-scroll-container]");
    expect(scrollContainer).toBeTruthy();
    expect(document.querySelector('[data-openclaw-text-target="landing.audit.url"]')).toBeNull();
    expect(scrollIntoView.mock.instances.some((node) => node === textarea)).toBe(true);
    expect(scrollTo.mock.instances.some((node) => node === scrollContainer)).toBe(true);
  });
});
