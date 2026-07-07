import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ crash }: { crash: boolean }) {
  if (crash) throw new Error("boom");
  return <div>child-ok</div>;
}

describe("ErrorBoundary", () => {
  it("resets its error state when chatId changes so the builder isn't stuck (#34)", () => {
    // React logs caught render errors to console.error; silence for a clean run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, queryByText } = render(
      <ErrorBoundary chatId="chat_a">
        <Boom crash />
      </ErrorBoundary>,
    );
    expect(queryByText("Något gick fel")).not.toBeNull();

    // Navigate to a different chat with a healthy child → boundary resets.
    rerender(
      <ErrorBoundary chatId="chat_b">
        <Boom crash={false} />
      </ErrorBoundary>,
    );
    expect(queryByText("child-ok")).not.toBeNull();
    expect(queryByText("Något gick fel")).toBeNull();
    spy.mockRestore();
  });

  it("does not reset on a same-chat re-render (no spurious recovery)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, queryByText } = render(
      <ErrorBoundary chatId="chat_a">
        <Boom crash />
      </ErrorBoundary>,
    );
    expect(queryByText("Något gick fel")).not.toBeNull();

    rerender(
      <ErrorBoundary chatId="chat_a">
        <Boom crash={false} />
      </ErrorBoundary>,
    );
    expect(queryByText("Något gick fel")).not.toBeNull();
    spy.mockRestore();
  });
});
