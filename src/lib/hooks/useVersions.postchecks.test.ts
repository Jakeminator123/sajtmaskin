import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ swr: vi.fn(), create: vi.fn(), wake: vi.fn() }));
vi.mock("swr", () => ({ default: mocks.swr }));
vi.mock("@/lib/hooks/postcheck-recovery", () => ({ createPostcheckRecovery: mocks.create }));
import { useVersions } from "./useVersions";

describe("versions polling recovery integration", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.swr.mockReturnValue({ data: { versions: [] }, mutate: vi.fn() });
    mocks.wake.mockResolvedValue(undefined); mocks.create.mockReturnValue(mocks.wake);
  });
  const pollSuccess = async () => {
    const payload = { versions: [{ id: "v", verificationState: "pending" }] };
    await act(async () => { mocks.swr.mock.calls.at(-1)![2].onSuccess(payload); });
    return payload;
  };
  it("wakes from the first successful poll after reopening and retains cooldown state through rerenders", async () => {
    const { rerender } = renderHook(() => useVersions("chat"));
    expect(mocks.create).toHaveBeenCalledWith("chat");
    const payload = await pollSuccess(); expect(mocks.wake).toHaveBeenCalledWith(payload);
    rerender(); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it.each([{ enabled: false }, { isGenerating: true }])("never wakes a disabled or actively generating caller: %j", async options => {
    renderHook(() => useVersions("chat", options)); await pollSuccess();
    expect(mocks.wake).not.toHaveBeenCalled();
  });
  it("does not carry another chat's identity into the new polling key", async () => {
    const { rerender } = renderHook(({ id }) => useVersions(id), { initialProps: { id: "one" } });
    rerender({ id: "two" }); await pollSuccess();
    expect(mocks.create.mock.calls.map(([id]) => id)).toEqual(["one", "two"]);
    expect(mocks.swr.mock.calls.at(-1)![0]).toBe("/api/engine/chats/two/versions");
  });
});
