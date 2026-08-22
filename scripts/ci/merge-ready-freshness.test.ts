import { readFileSync } from "node:fs";
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
    senderLogin: "other-review-bot[bot]",
    eventBody: "Nytt granskningsfynd",
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

  it.each(["", "abc123", "g".repeat(40), "a".repeat(41)])(
    "river labeln för ogiltig sign-off-sha %j även vid Cursor-status",
    (sha) => {
      const result = decideMergeReadyAction(
        input({
          eventName: "issue_comment",
          senderLogin: "cursor[bot]",
          eventBody: "Verifiering klar. Inga blockerande fynd hittades.",
          comments: [
            {
              body: `merge:ready — sha: ${sha}`,
              createdAt: "2026-07-29T12:00:00Z",
            },
          ],
        }),
      );

      expect(result.action).toBe("remove");
      expect(result.reason).toContain("ogiltig sign-off sha");
    },
  );

  it("behåller labeln när händelsen är äldre än sign-offen", () => {
    const result = decideMergeReadyAction(input({ eventAt: "2026-07-29T11:59:00Z" }));
    expect(result.action).toBe("keep");
  });

  it("river labeln när ett bot-fynd landar efter sign-offen", () => {
    const result = decideMergeReadyAction(input({ eventAt: "2026-07-29T12:00:01Z" }));
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("efter sign-off");
  });

  it("behåller labeln för en vanlig Cursor-verifieringskommentar", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "issue_comment",
        senderLogin: "cursor[bot]",
        eventBody: "Verifiering klar. Inga blockerande fynd hittades.",
      }),
    );
    expect(result.action).toBe("keep");
    expect(result.reason).toContain("utan Bugbot-fyndmarkör");
  });

  it("behåller labeln när Cursor Bugbot nått usage limit", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "issue_comment",
        senderLogin: "cursor[bot]",
        eventBody: "Bugbot couldn't run - usage limit reached",
      }),
    );
    expect(result.action).toBe("keep");
  });

  it("behåller labeln för en Cursor-automationskommentar utan ny buggranskning", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "issue_comment",
        senderLogin: "cursor[bot]",
        eventBody: "<!-- CURSOR_AUTOMATION_ID: nightly -->\nIngen ny buggranskning här.",
      }),
    );
    expect(result.action).toBe("keep");
  });

  it("river labeln för ett Cursor-fynd med BUGBOT_BUG_ID-markör", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "issue_comment",
        senderLogin: "cursor[bot]",
        eventBody: "<!-- BUGBOT_BUG_ID: eb123 -->\nP2: stale state",
      }),
    );
    expect(result.action).toBe("remove");
  });

  it("behåller labeln för ett trunkerat BUGBOT_BUG_ID-prefix", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "issue_comment",
        senderLogin: "cursor[bot]",
        eventBody: "<!-- BUGBOT_BUG_ID:\nStatusraden blev avklippt.",
      }),
    );
    expect(result.action).toBe("keep");
  });

  it("river labeln för ett Cursor-fynd med BUGBOT_REVIEW-markör", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "issue_comment",
        senderLogin: "cursor[bot]",
        eventBody: "<!-- BUGBOT_REVIEW -->\nEtt nytt fynd.",
      }),
    );
    expect(result.action).toBe("remove");
  });

  it("river labeln för en markörfri Cursor-review", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "pull_request_review",
        senderLogin: "cursor[bot]",
        eventBody: "P2: markörfritt review-fynd",
      }),
    );
    expect(result.action).toBe("remove");
  });

  it("river labeln för en annan bots nyare kommentar", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "issue_comment",
        senderLogin: "codex-reviewer[bot]",
        eventBody: "Status utan Cursor-markör",
      }),
    );
    expect(result.action).toBe("remove");
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

  it("trådar sender och event-body säkert från workflowens eventfil", () => {
    const workflow = readFileSync(".github/workflows/merge-ready-freshness.yml", "utf8");

    expect(workflow).toContain("GITHUB_EVENT_PATH");
    expect(workflow).toContain('.comment.body // .review.body // ""');
    expect(workflow).toContain('--arg senderLogin "$SENDER"');
    expect(workflow).toContain('--arg eventBody "$EVENT_BODY"');
    expect(workflow).toContain("senderLogin: $senderLogin");
    expect(workflow).toContain("eventBody: $eventBody");
    expect(workflow).not.toContain("${{ github.event.comment.body }}");
  });
});
