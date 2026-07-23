import { describe, expect, it } from "vitest";
import { decidePreviewHandoff } from "./preview-url-classifier";

// 2026-07 preview-lifecycle simplification: a preview handoff is exactly ONE
// of set-url / bump / noop — never URL-set + token-bump together (each causes
// its own iframe reload), and never a replay of an already-applied
// versionId:url handoff.
describe("decidePreviewHandoff", () => {
  const URL_A = "https://vm-fly-jakem.fly.dev/chat_1";
  const URL_B = "https://vm-fly-jakem.fly.dev/chat_2";

  it("noops on an empty incoming URL", () => {
    expect(
      decidePreviewHandoff({
        incomingUrl: "  ",
        currentUrl: URL_A,
        versionId: "v1",
        lastAppliedKey: null,
      }),
    ).toEqual({ action: "noop", key: null });
  });

  it("sets the URL when nothing is showing yet — even if the latch remembers the key", () => {
    // Cleared preview (chat switch / reset): the latch must never leave the
    // iframe white by noop-ing the repopulating handoff.
    expect(
      decidePreviewHandoff({
        incomingUrl: URL_A,
        currentUrl: null,
        versionId: "v1",
        lastAppliedKey: `v1:${URL_A}`,
      }),
    ).toEqual({ action: "set-url", key: `v1:${URL_A}` });
  });

  it("sets the URL (no bump) when the URL differs from what is showing", () => {
    expect(
      decidePreviewHandoff({
        incomingUrl: URL_B,
        currentUrl: URL_A,
        versionId: "v2",
        lastAppliedKey: `v1:${URL_A}`,
      }),
    ).toEqual({ action: "set-url", key: `v2:${URL_B}` });
  });

  it("bumps (no URL set) for a new version delivered on the same session URL", () => {
    // Follow-up swapped files into the same VM session: same URL, new
    // content — exactly one reload via the token.
    expect(
      decidePreviewHandoff({
        incomingUrl: URL_A,
        currentUrl: URL_A,
        versionId: "v2",
        lastAppliedKey: `v1:${URL_A}`,
      }),
    ).toEqual({ action: "bump", key: `v2:${URL_A}` });
  });

  it("noops when the exact versionId:url handoff was already applied (preview-ready → done → bootstrap replay)", () => {
    expect(
      decidePreviewHandoff({
        incomingUrl: URL_A,
        currentUrl: URL_A,
        versionId: "v1",
        lastAppliedKey: `v1:${URL_A}`,
      }),
    ).toEqual({ action: "noop", key: `v1:${URL_A}` });
  });

  it("force bypasses the latch but still picks exactly one action", () => {
    // Forced restart on the same URL → one reload via bump.
    expect(
      decidePreviewHandoff({
        incomingUrl: URL_A,
        currentUrl: URL_A,
        versionId: "v1",
        lastAppliedKey: `v1:${URL_A}`,
        force: true,
      }),
    ).toEqual({ action: "bump", key: `v1:${URL_A}` });
    // Forced restart landing on a different URL → set-url (the URL change reloads).
    expect(
      decidePreviewHandoff({
        incomingUrl: URL_B,
        currentUrl: URL_A,
        versionId: "v1",
        lastAppliedKey: `v1:${URL_B}`,
        force: true,
      }),
    ).toEqual({ action: "set-url", key: `v1:${URL_B}` });
  });

  it("uses '?' as the version key part when the versionId is unknown", () => {
    expect(
      decidePreviewHandoff({
        incomingUrl: URL_A,
        currentUrl: null,
        versionId: null,
        lastAppliedKey: null,
      }),
    ).toEqual({ action: "set-url", key: `?:${URL_A}` });
  });
});
