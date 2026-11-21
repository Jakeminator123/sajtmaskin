import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getPreviewPageNavigator,
  publishPreviewPageNavigator,
  usePreviewPageNavigator,
} from "./preview-page-navigator";

function Probe() {
  const navigator = usePreviewPageNavigator();
  return <span data-testid="route">{navigator ? (navigator.activeRoute ?? "ingen sida") : "ingen panel"}</span>;
}

describe("preview page navigator", () => {
  it("shows what the panel last published, and nothing after it is gone", () => {
    render(<Probe />);
    expect(screen.getByTestId("route").textContent).toBe("ingen panel");

    let unpublish = () => {};
    act(() => {
      unpublish = publishPreviewPageNavigator({ activeRoute: "/", navigate: vi.fn() });
    });
    expect(screen.getByTestId("route").textContent).toBe("/");

    act(() => unpublish());
    expect(screen.getByTestId("route").textContent).toBe("ingen panel");
    expect(getPreviewPageNavigator()).toBeNull();
  });

  it("lets a stale unpublish leave a newer panel alone", () => {
    const first = { activeRoute: "/", navigate: vi.fn() };
    const second = { activeRoute: "/kontakt", navigate: vi.fn() };
    const unpublishFirst = publishPreviewPageNavigator(first);
    const unpublishSecond = publishPreviewPageNavigator(second);

    unpublishFirst();
    expect(getPreviewPageNavigator()).toBe(second);
    unpublishSecond();
    expect(getPreviewPageNavigator()).toBeNull();
  });
});
