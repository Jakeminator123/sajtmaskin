import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Conversation,
  ConversationContent,
  ConversationItem,
  ConversationScrollButton,
} from "./conversation";

const PUBLIC_KEY = "NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER";
const ORIGINAL_PUBLIC = process.env[PUBLIC_KEY];

function renderConversation() {
  return render(
    <Conversation className="h-full">
      <ConversationContent>
        <ConversationItem messageId="m1" scrollAnchor>
          <div>User hello</div>
        </ConversationItem>
        <ConversationItem messageId="m2">
          <div>Assistant hi</div>
        </ConversationItem>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>,
  );
}

afterEach(() => {
  if (typeof ORIGINAL_PUBLIC === "undefined") delete process.env[PUBLIC_KEY];
  else process.env[PUBLIC_KEY] = ORIGINAL_PUBLIC;
});

describe("Conversation — MessageScroller path (flag on / default)", () => {
  it("renders messages inside the MessageScroller frame", () => {
    delete process.env[PUBLIC_KEY];

    const { container } = renderConversation();

    expect(screen.getByText("User hello")).toBeTruthy();
    expect(screen.getByText("Assistant hi")).toBeTruthy();
    // The shadcn MessageScroller frame + viewport + content are present.
    expect(container.querySelector('[data-slot="message-scroller"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="message-scroller-viewport"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="message-scroller-content"]')).toBeTruthy();
  });

  it("wraps each ConversationItem as a MessageScroller item", () => {
    delete process.env[PUBLIC_KEY];
    const { container } = renderConversation();
    const items = container.querySelectorAll('[data-slot="message-scroller-item"]');
    expect(items.length).toBe(2);
  });

  it("renders the scroll-to-bottom control with the Swedish accessible label", () => {
    delete process.env[PUBLIC_KEY];
    renderConversation();
    expect(
      screen.getByLabelText("Scrolla ned till senaste meddelande"),
    ).toBeTruthy();
  });

  it("arms only appended user turns, never initial or prepended history", () => {
    delete process.env[PUBLIC_KEY];

    function Transcript({ ids }: { ids: string[] }) {
      return (
        <Conversation className="h-full">
          <ConversationContent>
            {ids.map((id) => (
              <ConversationItem key={id} messageId={id} scrollAnchor={id.startsWith("user-")}>
                <div>{id}</div>
              </ConversationItem>
            ))}
          </ConversationContent>
        </Conversation>
      );
    }

    const { container, rerender } = render(
      <Transcript ids={["user-old", "assistant-old"]} />,
    );
    const anchorState = (id: string) =>
      container
        .querySelector(`[data-message-id="${id}"]`)
        ?.getAttribute("data-scroll-anchor");

    // Existing transcript rows must not be mistaken for a fresh turn when the
    // assistant row later changes size/content.
    expect(anchorState("user-old")).toBe("false");

    // Loading older history before the committed transcript preserves position
    // and does not arm that historical user row.
    rerender(
      <Transcript ids={["user-older", "assistant-older", "user-old", "assistant-old"]} />,
    );
    expect(anchorState("user-older")).toBe("false");
    expect(anchorState("user-old")).toBe("false");

    // A genuinely appended user turn remains the anchor while its assistant
    // response streams and triggers resize/content updates.
    rerender(
      <Transcript
        ids={[
          "user-older",
          "assistant-older",
          "user-old",
          "assistant-old",
          "user-live",
          "assistant-live",
        ]}
      />,
    );
    expect(anchorState("user-live")).toBe("true");
    expect(anchorState("user-old")).toBe("false");
  });

  it("preserves anchoring for a genuinely live first turn", () => {
    delete process.env[PUBLIC_KEY];
    const { container } = render(
      <Conversation className="h-full">
        <ConversationContent>
          <ConversationItem
            messageId="user-first-live"
            scrollAnchor
            liveScrollAnchor
          >
            <div>First live prompt</div>
          </ConversationItem>
        </ConversationContent>
      </Conversation>,
    );

    expect(
      container
        .querySelector('[data-message-id="user-first-live"]')
        ?.getAttribute("data-scroll-anchor"),
    ).toBe("true");
  });
});

describe("Conversation — legacy path (flag off)", () => {
  it("falls back to the simple overflow scroll (no MessageScroller frame)", () => {
    process.env[PUBLIC_KEY] = "0";

    const { container } = renderConversation();

    // Messages still render (drop-in).
    expect(screen.getByText("User hello")).toBeTruthy();
    expect(screen.getByText("Assistant hi")).toBeTruthy();
    // No shadcn MessageScroller DOM in the legacy path.
    expect(container.querySelector('[data-slot="message-scroller"]')).toBeNull();
    expect(
      container.querySelector('[data-slot="message-scroller-item"]'),
    ).toBeNull();
    // ConversationItem is a no-op fragment in legacy mode: children render
    // directly, so the two message divs are still present.
    expect(screen.getByText("User hello").tagName).toBe("DIV");
  });

  it("hides the legacy scroll button while at the bottom (default state)", () => {
    process.env[PUBLIC_KEY] = "false";
    renderConversation();
    // Legacy button only appears when scrolled away from the bottom; jsdom
    // reports the initial state as at-bottom, so it is not rendered.
    expect(
      screen.queryByLabelText("Scrolla ned till senaste meddelande"),
    ).toBeNull();
  });
});
