import { describe, expect, it } from "vitest";
import { decideMergeReadyAction } from "./merge-ready-freshness.mjs";

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);

function signoff(sha = HEAD, at = "2026-07-29T12:00:00Z") {
  return `merge:ready — sha: ${sha}, at: ${at}, bugkoll: bugbot, triage: 0, P0/P1: 0`;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    eventName: "pull_request_review",
    headSha: HEAD,
    labels: ["merge:ready"],
    eventAt: "2026-07-29T12:05:00Z",
    prBody: "",
    comments: [{ body: signoff(), createdAt: "2026-07-29T12:00:00Z" }],
    ...overrides,
  } as Parameters<typeof decideMergeReadyAction>[0];
}

describe("decideMergeReadyAction", () => {
  it("no-op när labeln inte är satt", () => {
    expect(decideMergeReadyAction(input({ labels: [] })).action).toBe("keep");
  });

  it("river labeln vid ny commit", () => {
    const result = decideMergeReadyAction(input({ eventName: "pull_request" }));
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("ny commit");
  });

  it("river labeln när sign-off-raden saknas helt", () => {
    const result = decideMergeReadyAction(input({ comments: [], prBody: "ingen sign-off här" }));
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("utan giltig sign-off");
  });

  it("river labeln när sign-off-sha inte matchar head", () => {
    const result = decideMergeReadyAction(
      input({ comments: [{ body: signoff(OTHER), createdAt: "2026-07-29T12:00:00Z" }] }),
    );
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("!= head");
  });

  it("behåller labeln när händelsen är äldre än sign-offen", () => {
    const result = decideMergeReadyAction(input({ eventAt: "2026-07-29T11:59:00Z" }));
    expect(result.action).toBe("keep");
  });

  it("river labeln när ett bot-fynd landar efter sign-offen", () => {
    const result = decideMergeReadyAction(input({ eventAt: "2026-07-29T12:00:01Z" }));
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("efter sign-off");
  });

  /**
   * Codex P1 på #652. Att jämföra ett författarstyrt `at:` mot runnerns klocka
   * räcker inte: startar jobbet med fördröjning hinner ett framtidsdaterat
   * `at:` bli förflutet, och bot-fyndet däremellan räknas som äldre. Vi läser
   * därför kommentarens serverside-`created_at` och ignorerar `at:`-texten.
   */
  it("ignorerar ett framtidsdaterat at: och använder kommentarens tidsstämpel", () => {
    const result = decideMergeReadyAction(
      input({
        // Sign-offen postades 12:00 men påstår 12:10.
        comments: [
          { body: signoff(HEAD, "2026-07-29T12:10:00Z"), createdAt: "2026-07-29T12:00:00Z" },
        ],
        // Bot-fyndet kom 12:05 — efter sign-offen, före det påstådda at:.
        eventAt: "2026-07-29T12:05:00Z",
      }),
    );

    expect(result.action).toBe("remove");
    expect(result.reason).toContain("efter sign-off");
  });

  it("river labeln när sign-offen bara står i PR-beskrivningen (ingen verifierbar tid)", () => {
    const result = decideMergeReadyAction(input({ comments: [], prBody: signoff() }));
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("verifierbar tidsstämpel");
  });

  it("väljer den nyaste sign-off-kommentaren, oavsett ordning i listan", () => {
    const result = decideMergeReadyAction(
      input({
        comments: [
          { body: signoff(HEAD), createdAt: "2026-07-29T12:30:00Z" },
          { body: signoff(OTHER), createdAt: "2026-07-29T11:00:00Z" },
        ],
        eventAt: "2026-07-29T12:20:00Z",
      }),
    );

    // Nyaste sign-offen matchar head och är nyare än händelsen.
    expect(result.action).toBe("keep");
  });

  it("hanterar tidsstämplar med bråkdelssekunder", () => {
    const result = decideMergeReadyAction(
      input({
        comments: [{ body: signoff(), createdAt: "2026-07-29T12:00:00.500Z" }],
        eventAt: "2026-07-29T12:00:00.900Z",
      }),
    );
    // Samma sekund efter avrundning — inte nyare, labeln behålls.
    expect(result.action).toBe("keep");
  });

  it("river labeln när en tidsstämpel inte går att tolka", () => {
    const result = decideMergeReadyAction(input({ eventAt: "inte-ett-datum" }));
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("jämföra tidpunkter");
  });

  it("matchar sign-off med bindestreck och kolon, inte bara em-dash", () => {
    for (const separator of ["—", "–", "-", ":"]) {
      const line = `merge:ready ${separator} sha: ${HEAD}, at: 2026-07-29T12:00:00Z`;
      const result = decideMergeReadyAction(
        input({
          comments: [{ body: line, createdAt: "2026-07-29T12:00:00Z" }],
          eventAt: "2026-07-29T11:59:00Z",
        }),
      );
      expect(result.action, `separator ${separator}`).toBe("keep");
    }
  });
});
