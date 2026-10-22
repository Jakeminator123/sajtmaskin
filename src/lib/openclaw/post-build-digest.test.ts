import { describe, expect, it } from "vitest";
import { parseArmingDirective, parseStopDirective } from "./debug/armed-mandate";
import {
  buildPostBuildDigestPrompt,
  decidePostBuildDigest,
  type PostBuildDigestSnapshot,
} from "./post-build-digest";

function snap(overrides: Partial<PostBuildDigestSnapshot> = {}): PostBuildDigestSnapshot {
  return {
    chatId: "chat_1",
    activeVersionId: "v2",
    versionStatus: "ready",
    versionIsLatest: true,
    isStreaming: false,
    ...overrides,
  };
}

const base = {
  enabled: true,
  agentStreaming: false,
  continuationActive: false,
  lastDigestVersionId: null,
};

describe("decidePostBuildDigest", () => {
  it("väcker en gång när en ny version blir terminal efter en ström", () => {
    expect(
      decidePostBuildDigest({
        ...base,
        prev: snap({ activeVersionId: "v1", isStreaming: true }),
        next: snap(),
      }),
    ).toEqual({ kind: "digest", versionId: "v2", versionStatus: "ready" });
  });

  it("väcker när statusen går från pågående till terminal på samma version", () => {
    expect(
      decidePostBuildDigest({
        ...base,
        prev: snap({ versionStatus: "verifying" }),
        next: snap({ versionStatus: "degraded" }),
      }),
    ).toEqual({ kind: "digest", versionId: "v2", versionStatus: "degraded" });
  });

  it("väcker aldrig på en sidladdning eller när inget hänt", () => {
    expect(decidePostBuildDigest({ ...base, prev: null, next: snap() })).toEqual({ kind: "idle" });
    expect(decidePostBuildDigest({ ...base, prev: snap(), next: snap() })).toEqual({ kind: "idle" });
  });

  it("väcker inte samma version två gånger", () => {
    expect(
      decidePostBuildDigest({
        ...base,
        lastDigestVersionId: "v2",
        prev: snap({ isStreaming: true }),
        next: snap(),
      }),
    ).toEqual({ kind: "idle" });
  });

  it("väntar medan turen strömmar, versionen inte är senast eller statusen inte är terminal", () => {
    const prev = snap({ isStreaming: true });
    expect(decidePostBuildDigest({ ...base, prev, next: snap({ isStreaming: true }) })).toEqual({
      kind: "idle",
    });
    expect(
      decidePostBuildDigest({ ...base, prev, next: snap({ versionIsLatest: false }) }),
    ).toEqual({ kind: "idle" });
    expect(
      decidePostBuildDigest({ ...base, prev, next: snap({ versionStatus: "verifying" }) }),
    ).toEqual({ kind: "idle" });
  });

  it("låter inställning, agentström och armerad continuation stoppa väckningen", () => {
    const prev = snap({ isStreaming: true });
    expect(decidePostBuildDigest({ ...base, enabled: false, prev, next: snap() })).toEqual({
      kind: "idle",
    });
    expect(decidePostBuildDigest({ ...base, agentStreaming: true, prev, next: snap() })).toEqual({
      kind: "idle",
    });
    expect(
      decidePostBuildDigest({ ...base, continuationActive: true, prev, next: snap() }),
    ).toEqual({ kind: "idle" });
  });

  it("ignorerar en övergång som hör till en annan chatt", () => {
    expect(
      decidePostBuildDigest({
        ...base,
        prev: snap({ chatId: "chat_0", isStreaming: true }),
        next: snap(),
      }),
    ).toEqual({ kind: "idle" });
  });
});

describe("buildPostBuildDigestPrompt", () => {
  it("är en intern tur som varken armerar eller stoppar", () => {
    const prompt = buildPostBuildDigestPrompt({ versionStatus: "ready" });
    expect(prompt.startsWith("[Byggresultat]")).toBe(true);
    expect(prompt).toContain("status: ready");
    expect(parseArmingDirective(prompt)).toBeNull();
    expect(parseStopDirective(prompt)).toBe(false);
  });
});
