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

/** En ström sågs från v1 och v2 landade terminal. */
const afterBuild = {
  enabled: true,
  agentStreaming: false,
  continuationActive: false,
  lastDigestVersionId: null,
  streamedSinceLastDigest: true,
  versionIdAtStreamStart: "v1",
};

describe("decidePostBuildDigest", () => {
  it("väcker en gång när en ström gav en ny terminal version", () => {
    expect(decidePostBuildDigest({ ...afterBuild, next: snap() })).toEqual({
      kind: "digest",
      versionId: "v2",
      versionStatus: "ready",
    });
    expect(
      decidePostBuildDigest({ ...afterBuild, next: snap({ versionStatus: "degraded" }) }),
    ).toEqual({ kind: "digest", versionId: "v2", versionStatus: "degraded" });
  });

  it("väcker inte på sidladdning, navigering eller en ström som inte byggde något", () => {
    // Ingen ström sedd i chatten (sidladdning, chattöppning, versionsbyte).
    expect(
      decidePostBuildDigest({ ...afterBuild, streamedSinceLastDigest: false, next: snap() }),
    ).toEqual({ kind: "idle" });
    // Strömmen (plan, motfråga, 409/412, avbryt) lämnade versionen orörd.
    expect(
      decidePostBuildDigest({ ...afterBuild, versionIdAtStreamStart: "v2", next: snap() }),
    ).toEqual({ kind: "idle" });
  });

  it("väcker inte samma version två gånger", () => {
    expect(
      decidePostBuildDigest({ ...afterBuild, lastDigestVersionId: "v2", next: snap() }),
    ).toEqual({ kind: "idle" });
  });

  it("väntar medan turen strömmar, versionen inte är senast eller statusen inte är terminal", () => {
    expect(decidePostBuildDigest({ ...afterBuild, next: snap({ isStreaming: true }) })).toEqual({
      kind: "idle",
    });
    expect(
      decidePostBuildDigest({ ...afterBuild, next: snap({ versionIsLatest: false }) }),
    ).toEqual({ kind: "idle" });
    expect(
      decidePostBuildDigest({ ...afterBuild, next: snap({ versionStatus: "verifying" }) }),
    ).toEqual({ kind: "idle" });
  });

  it("låter inställning, agentström och armerad continuation stoppa väckningen", () => {
    expect(decidePostBuildDigest({ ...afterBuild, enabled: false, next: snap() })).toEqual({
      kind: "idle",
    });
    expect(decidePostBuildDigest({ ...afterBuild, agentStreaming: true, next: snap() })).toEqual({
      kind: "idle",
    });
    expect(
      decidePostBuildDigest({ ...afterBuild, continuationActive: true, next: snap() }),
    ).toEqual({ kind: "idle" });
  });

  it("kräver en chatt och en version", () => {
    expect(decidePostBuildDigest({ ...afterBuild, next: snap({ chatId: null }) })).toEqual({
      kind: "idle",
    });
    expect(
      decidePostBuildDigest({ ...afterBuild, next: snap({ activeVersionId: null }) }),
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
