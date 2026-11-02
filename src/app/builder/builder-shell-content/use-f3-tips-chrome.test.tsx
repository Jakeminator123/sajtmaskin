import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchF3Requirements,
  dispatchF3Status,
  PROJECT_ENV_VARS_UPDATED_EVENT,
  type ProjectEnvVarsUpdatedDetail,
} from "@/lib/builder/project-env-events";
import type { BuilderViewModel } from "../useBuilderPageController";
import { useShellF3TipsChrome } from "./use-f3-tips-chrome";

vi.mock("@/lib/builder/project-env-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/builder/project-env-events")>();
  return { ...actual, openDossiersPanel: vi.fn() };
});

/** Minimal vm stub — only the fields the chrome hook reads. */
function makeVm(chatId: string | null, activeVersionId: string | null): BuilderViewModel {
  return { chatId, activeVersionId } as unknown as BuilderViewModel;
}

function renderChrome(chatId: string | null, activeVersionId: string | null) {
  const sendMessage = vi.fn(async () => ({ status: "started", via: "stream" }) as const);
  return renderHook(
    ({ chat, version }: { chat: string | null; version: string | null }) =>
      useShellF3TipsChrome(makeVm(chat, version), sendMessage as never),
    { initialProps: { chat: chatId, version: activeVersionId } },
  );
}

function requirements(parentVersionId: string, missing: string[], requestStartedAt?: number) {
  return {
    parentVersionId,
    chatId: "chat_a",
    requestStartedAt,
    missingByIntegration: [{ key: "stripe", name: "Stripe", missing }],
  };
}

function envUpdated(detail: ProjectEnvVarsUpdatedDetail) {
  window.dispatchEvent(new CustomEvent(PROJECT_ENV_VARS_UPDATED_EVENT, { detail }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useShellF3TipsChrome — scope-tagged F3 state (no reset effects)", () => {
  it("shows a 412 only on the version it belongs to, in the chat it arrived in", () => {
    const { result, rerender } = renderChrome("chat_a", "v1");
    act(() => dispatchF3Requirements(requirements("v1", ["STRIPE_KEY"])));
    expect(result.current.f3Requirements?.parentVersionId).toBe("v1");

    rerender({ chat: "chat_a", version: "v2" });
    expect(result.current.f3Requirements).toBeNull();

    // Nothing about the verdict changed — back on v1 it is visible again.
    rerender({ chat: "chat_a", version: "v1" });
    expect(result.current.f3Requirements?.parentVersionId).toBe("v1");

    rerender({ chat: "chat_b", version: "v1" });
    expect(result.current.f3Requirements).toBeNull();
    expect(result.current.visibleF3Requirements).toBeNull();
  });

  it("ignores a late 412 from another chat", () => {
    const { result } = renderChrome("chat_a", "v1");
    act(() =>
      dispatchF3Requirements({ ...requirements("v1", ["STRIPE_KEY"]), chatId: "chat_other" }),
    );
    expect(result.current.f3Requirements).toBeNull();
  });

  it("scopes a status with a version to that version, keeps a versionless one until the chat changes", () => {
    const { result, rerender } = renderChrome("chat_a", "v1");
    act(() =>
      dispatchF3Status({
        tone: "success",
        title: "Klart",
        description: "Allt gick igenom",
        chatId: "chat_a",
        versionId: "v1",
      }),
    );
    expect(result.current.visibleF3Status?.title).toBe("Klart");
    rerender({ chat: "chat_a", version: "v2" });
    expect(result.current.visibleF3Status).toBeNull();

    act(() =>
      dispatchF3Status({
        tone: "info",
        title: "Ingen version ännu",
        description: "Bygg först",
        chatId: "chat_a",
      }),
    );
    rerender({ chat: "chat_a", version: "v3" });
    expect(result.current.visibleF3Status?.title).toBe("Ingen version ännu");
    rerender({ chat: "chat_b", version: "v3" });
    expect(result.current.visibleF3Status).toBeNull();
  });

  it("subtracts keys saved after the request started and re-adds a deleted key", () => {
    const { result } = renderChrome("chat_a", "v1");
    act(() =>
      dispatchF3Requirements(requirements("v1", ["STRIPE_KEY", "STRIPE_SECRET"], Date.now() - 1)),
    );
    act(() =>
      envUpdated({ projectId: "p1", chatId: "chat_a", envKeys: ["stripe_key"], action: "saved" }),
    );
    expect(result.current.visibleF3Requirements?.missingByIntegration[0].missing).toEqual([
      "STRIPE_SECRET",
    ]);

    act(() =>
      envUpdated({ projectId: "p1", chatId: "chat_a", envKeys: ["STRIPE_KEY"], action: "deleted" }),
    );
    expect(result.current.visibleF3Requirements?.missingByIntegration[0].missing).toEqual([
      "STRIPE_KEY",
      "STRIPE_SECRET",
    ]);
  });

  it("lets a new verdict supersede keys saved before it, and keeps saves made during the request", () => {
    const { result } = renderChrome("chat_a", "v1");
    act(() =>
      envUpdated({ projectId: "p1", chatId: "chat_a", envKeys: ["OLD_KEY"], action: "saved" }),
    );
    const requestStartedAt = Date.now() + 1;
    act(() =>
      envUpdated({ projectId: "p1", chatId: "chat_a", envKeys: ["NEW_KEY"], action: "saved" }),
    );
    // Make NEW_KEY's save land after the request start, OLD_KEY's before it.
    vi.spyOn(Date, "now").mockReturnValue(requestStartedAt + 10);
    act(() =>
      envUpdated({ projectId: "p1", chatId: "chat_a", envKeys: ["NEW_KEY"], action: "saved" }),
    );
    act(() => dispatchF3Requirements(requirements("v1", ["OLD_KEY", "NEW_KEY"], requestStartedAt)));
    expect(result.current.visibleF3Requirements?.missingByIntegration[0].missing).toEqual([
      "OLD_KEY",
    ]);
    vi.restoreAllMocks();
  });

  it("drops the whole verdict when a key outside its scope is deleted", () => {
    const { result } = renderChrome("chat_a", "v1");
    act(() => dispatchF3Requirements(requirements("v1", ["STRIPE_KEY"])));
    act(() =>
      envUpdated({ projectId: "p1", chatId: "chat_a", envKeys: ["UNRELATED"], action: "deleted" }),
    );
    expect(result.current.f3Requirements).toBeNull();
  });

  it("keeps the external setter contract: setF3Requirements accepts values and updaters", () => {
    const { result } = renderChrome("chat_a", "v1");
    act(() => result.current.setF3Requirements(requirements("v1", ["A"])));
    expect(result.current.f3Requirements?.missingByIntegration[0].missing).toEqual(["A"]);
    act(() => result.current.setF3Requirements((current) => (current ? null : current)));
    expect(result.current.f3Requirements).toBeNull();
    act(() => result.current.setF3Status({ tone: "info", title: "x", description: "y", versionId: null }));
    expect(result.current.visibleF3Status?.title).toBe("x");
    act(() => result.current.setF3Status(null));
    expect(result.current.visibleF3Status).toBeNull();
  });
});
