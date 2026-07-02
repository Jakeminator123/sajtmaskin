/**
 * Recovery contract for the builder ErrorBoundary.
 *
 * `getDerivedStateFromError` latches `hasError` and nothing else clears it, so
 * a single render error would keep the fallback mounted forever. The boundary
 * must recover when the caller-provided `resetKey` changes (the builder passes
 * `chatId`, so navigating to another chat clears a stuck fallback) while
 * staying latched when the key is unchanged (same-chat behavior).
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("kaboom");
  return <div>child ok</div>;
}

describe("ErrorBoundary reset", () => {
  beforeEach(() => {
    // React logs caught render errors to console.error; silence to keep test
    // output clean without hiding assertion failures.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the fallback after a child render error", () => {
    render(
      <ErrorBoundary resetKey="chat_1">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Något gick fel")).toBeTruthy();
  });

  it("recovers when resetKey changes (navigation to another chat)", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="chat_1">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Något gick fel")).toBeTruthy();

    rerender(
      <ErrorBoundary resetKey="chat_2">
        <Boom explode={false} />
      </ErrorBoundary>,
    );

    expect(screen.queryByText("Något gick fel")).toBeNull();
    expect(screen.getByText("child ok")).toBeTruthy();
  });

  it("stays latched on the fallback when resetKey is unchanged (same chat)", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="chat_1">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Något gick fel")).toBeTruthy();

    rerender(
      <ErrorBoundary resetKey="chat_1">
        <Boom explode={false} />
      </ErrorBoundary>,
    );

    // No key change → no reset → fallback persists (identical non-navigation
    // behavior), so the recovered child must NOT be shown.
    expect(screen.getByText("Något gick fel")).toBeTruthy();
    expect(screen.queryByText("child ok")).toBeNull();
  });
});
