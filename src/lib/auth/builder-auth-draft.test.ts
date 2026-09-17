import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILDER_AUTH_DRAFT_KEY, BUILDER_AUTH_DRAFT_TTL_MS,
  consumeBuilderAuthDraft, isBuilderAuthResume, saveBuilderAuthDraft,
} from "./builder-auth-draft";

const now = 1_000_000;
const href = "https://preview.example.test/builder?buildMethod=kostnadsfri";
let data: Map<string, string>;
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
};
const input = { message: "Min företagshemsida", projectId: "p1", promptHandoffId: "h1", ownerId: "u1" };
const save = () => saveBuilderAuthDraft(storage, href, input, "resume-1", now);
const absolute = (path: string) => new URL(path, href).href;

beforeEach(() => { data = new Map(); });

describe("builder auth draft", () => {
  it("returns to the same builder with campaign/project context and without text in the URL", () => {
    const result = save();
    const url = new URL(result.returnTo, href);
    expect(result.draftSaved).toBe(true);
    expect(result.returnTo.startsWith("/builder?")).toBe(true);
    expect(url.searchParams.get("project")).toBe("p1");
    expect(url.searchParams.get("promptId")).toBe("h1");
    expect(url.searchParams.get("buildMethod")).toBe("kostnadsfri");
    expect(result.returnTo).not.toContain(encodeURIComponent(input.message));
  });

  it("restores once, only on an explicit matching return", () => {
    const result = save();
    expect(consumeBuilderAuthDraft(storage, href, "u1", now)).toBeNull();
    expect(consumeBuilderAuthDraft(storage, absolute(result.returnTo) + "&login=success", "u1", now)).toBe(input.message);
    expect(consumeBuilderAuthDraft(storage, absolute(result.returnTo), "u1", now)).toBeNull();
  });

  it("refuses a different account", () => {
    const result = save();
    expect(consumeBuilderAuthDraft(storage, absolute(result.returnTo), "u2", now)).toBeNull();
    expect(data.has(BUILDER_AUTH_DRAFT_KEY)).toBe(false);
  });

  it.each(["project=p2", "promptId=h2", "chatId=c2", "buildMethod=freeform"])("refuses changed context: %s", (change) => {
    const url = new URL(save().returnTo, href);
    const [key, value] = change.split("=");
    url.searchParams.set(key, value);
    expect(consumeBuilderAuthDraft(storage, url.href, "u1", now)).toBeNull();
  });

  it("refuses expired drafts", () => {
    const result = save();
    expect(consumeBuilderAuthDraft(storage, absolute(result.returnTo), "u1", now + BUILDER_AUTH_DRAFT_TTL_MS + 1)).toBeNull();
  });

  it("does not restore drafts timestamped in the future", () => {
    const result = save();
    expect(consumeBuilderAuthDraft(storage, absolute(result.returnTo), "u1", now - 1)).toBeNull();
  });

  it("handles blocked storage without preventing login", () => {
    const blocked = { ...storage, setItem: () => { throw new Error("blocked"); } };
    const result = saveBuilderAuthDraft(blocked, href, input, "r1", now);
    expect(result.draftSaved).toBe(false);
    expect(isBuilderAuthResume(absolute(result.returnTo))).toBe(true);
  });

  it("handles corrupt storage safely", () => {
    const result = save();
    data.set(BUILDER_AUTH_DRAFT_KEY, "not json");
    expect(consumeBuilderAuthDraft(storage, absolute(result.returnTo), "u1", now)).toBeNull();
  });

  it("keeps an existing chat target rather than a consumed new-chat handoff", () => {
    const result = saveBuilderAuthDraft(storage, "https://example.test/builder?chatId=c1", {
      message: "Ändra rubriken", chatId: "c1", projectId: "p1", promptHandoffId: "h1", ownerId: "u1",
    }, "r1", now);
    const url = new URL(result.returnTo, href);
    expect(url.searchParams.get("chatId")).toBe("c1");
    expect(url.searchParams.has("promptId")).toBe(false);
    expect(consumeBuilderAuthDraft(storage, url.href, "u1", now)).toBe("Ändra rubriken");
  });
});
