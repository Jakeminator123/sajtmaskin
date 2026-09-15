import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KOSTNADSFRI_INFORMATION_PATH } from "@/lib/kostnadsfri/analytics-paths";
import { PasswordGate } from "./password-gate";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./intro-video", () => ({
  IntroVideo: () => null,
}));

describe("PasswordGate", () => {
  it("links the offer copy to the invite-only information page", () => {
    render(
      <PasswordGate slug="acme-ab" companyName="Acme AB" onSuccess={() => {}} />,
    );

    expect(
      screen.getByRole("link", { name: "Läs mer om erbjudandet" }).getAttribute("href"),
    ).toBe(KOSTNADSFRI_INFORMATION_PATH);
    expect(screen.getByText(/Vill du veta mer får du gärna läsa mer om erbjudandet/)).toBeTruthy();
  });
});
