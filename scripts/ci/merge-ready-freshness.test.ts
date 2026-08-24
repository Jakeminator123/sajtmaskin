import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decideMergeReadyAction,
  validateMergeExecuteMandate,
  validateMergeReadySignoff,
} from "./merge-ready-freshness.mjs";

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const BASE = "c".repeat(40);
const OTHER_BASE = "d".repeat(40);

function signoff(headSha = HEAD, at = "2026-07-29T12:00:00Z", baseSha = BASE) {
  return `merge:ready — head-sha: ${headSha}, base-sha: ${baseSha}, at: ${at}, bugkoll: bugbot, triage: 0, P0/P1: 0`;
}

function input(overrides: Record<string, unknown> = {}) {
  const result = {
    eventName: "pull_request_review",
    senderLogin: "other-review-bot[bot]",
    eventBody: "Nytt granskningsfynd",
    headSha: HEAD,
    baseSha: BASE,
    baseIsAncestor: true,
    prAuthorLogin: "pr-author",
    labels: ["merge:ready"],
    eventAt: "2026-07-29T12:05:00Z",
    prBody: "",
    comments: [{ body: signoff(), createdAt: "2026-07-29T12:00:00Z" }],
    ...overrides,
  } as Parameters<typeof decideMergeReadyAction>[0];
  result.comments = (result.comments ?? []).map((comment) => ({
    authorLogin: "pr-author",
    authorType: "User",
    authorAssociation: "NONE",
    ...comment,
  }));
  return result;
}

describe("decideMergeReadyAction", () => {
  it("no-op när labeln inte är satt", () => {
    expect(decideMergeReadyAction(input({ labels: [] })).action).toBe("keep");
  });

  it("river labeln vid ny commit", () => {
    const result = decideMergeReadyAction(
      input({ eventName: "pull_request_target", eventAction: "synchronize" }),
    );
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("ny commit");
  });

  it("river labeln när PR:en blir draft med korrekt orsak", () => {
    const result = decideMergeReadyAction(
      input({ eventName: "pull_request_target", eventAction: "converted_to_draft" }),
    );
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("draft");
    expect(result.reason).not.toContain("ny commit");
  });

  it("river labeln när PR:en återöppnas med korrekt orsak", () => {
    const result = decideMergeReadyAction(
      input({ eventName: "pull_request_target", eventAction: "reopened" }),
    );
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("återöppnad");
    expect(result.reason).not.toContain("ny commit");
  });

  it("behåller merge:ready vid labeltillfället när head och base matchar", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "pull_request_target",
        eventAction: "labeled",
        eventLabel: "merge:ready",
        // Valideringen får inte bero på att labels-API:t redan hunnit konvergera.
        labels: [],
        eventAt: "",
      }),
    );

    expect(result.action).toBe("keep");
    expect(result.reason).toContain("matchar aktuell head");
    expect(result.reason).toContain("base");
  });

  it("ignorerar labeled-event för alla andra labels", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "pull_request_target",
        eventAction: "labeled",
        eventLabel: "risk:3",
        labels: ["merge:ready", "risk:3"],
        comments: [],
      }),
    );

    expect(result.action).toBe("keep");
    expect(result.reason).toContain("annan label");
  });

  it("river merge:ready vid labeltillfället när head-sign-offen är gammal", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "pull_request_target",
        eventAction: "labeled",
        eventLabel: "merge:ready",
        comments: [{ body: signoff(OTHER), createdAt: "2026-07-29T12:00:00Z" }],
      }),
    );

    expect(result.action).toBe("remove");
    expect(result.reason).toContain("!= aktuell head");
  });

  it("river merge:ready vid labeltillfället när base-sign-offen är gammal", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "pull_request_target",
        eventAction: "labeled",
        eventLabel: "merge:ready",
        comments: [
          {
            body: signoff(HEAD, "2026-07-29T12:00:00Z", OTHER_BASE),
            createdAt: "2026-07-29T12:00:00Z",
          },
        ],
      }),
    );

    expect(result.action).toBe("remove");
    expect(result.reason).toContain("!= aktuell base");
  });

  it("river merge:ready fail-closed när aktuell base inte är ancestor till head", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "pull_request_target",
        eventAction: "labeled",
        eventLabel: "merge:ready",
        baseIsAncestor: false,
      }),
    );

    expect(result.action).toBe("remove");
    expect(result.reason).toContain("head innehåller aktuell base");
  });

  it.each([
    [
      `merge:ready — head-sha: ${HEAD}, base-sha: ${BASE}, bugkoll: bugbot, triage: klar, P0/P1: 0`,
      "at-fält",
    ],
    [
      `merge:ready — head-sha: ${HEAD}, base-sha: ${BASE}, at: inte-utc, bugkoll: bugbot, triage: klar, P0/P1: 0`,
      "at-fält",
    ],
    [
      `merge:ready — head-sha: ${HEAD}, base-sha: ${BASE}, at: 2026-07-29T12:00:00Z, bugkoll: , triage: klar, P0/P1: 0`,
      "bugkoll",
    ],
    [
      `merge:ready — head-sha: ${HEAD}, base-sha: ${BASE}, at: 2026-07-29T12:00:00Z, bugkoll: bugbot, triage: , P0/P1: 0`,
      "triage",
    ],
    [
      `merge:ready — head-sha: ${HEAD}, base-sha: ${BASE}, at: 2026-07-29T12:00:00Z, bugkoll: bugbot, triage: klar, P0/P1: 9`,
      "P0/P1: 0",
    ],
  ])("river labeln när sign-off-formen är ofullständig", (body, reason) => {
    const result = decideMergeReadyAction(
      input({ comments: [{ body, createdAt: "2026-07-29T12:00:00Z" }] }),
    );
    expect(result.action).toBe("remove");
    expect(result.reason).toContain(reason);
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
    expect(result.reason).toContain("!= aktuell head");
  });

  it.each(["", "abc123", "g".repeat(40), "a".repeat(41)])(
    "river labeln för ogiltig sign-off head-sha %j även vid Cursor-status",
    (sha) => {
      const result = decideMergeReadyAction(
        input({
          eventName: "issue_comment",
          senderLogin: "cursor[bot]",
          eventBody: "Verifiering klar. Inga blockerande fynd hittades.",
          comments: [
            {
              body: `merge:ready — head-sha: ${sha}, base-sha: ${BASE}`,
              createdAt: "2026-07-29T12:00:00Z",
            },
          ],
        }),
      );

      expect(result.action).toBe("remove");
      expect(result.reason).toContain("ogiltig sign-off head-sha");
    },
  );

  it.each(["", "abc123", "g".repeat(40), "c".repeat(41)])(
    "river labeln för ogiltig sign-off base-sha %j",
    (baseSha) => {
      const result = decideMergeReadyAction(
        input({
          comments: [
            {
              body: `merge:ready — head-sha: ${HEAD}, base-sha: ${baseSha}`,
              createdAt: "2026-07-29T12:00:00Z",
            },
          ],
        }),
      );

      expect(result.action).toBe("remove");
      expect(result.reason).toContain("ogiltig sign-off base-sha");
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

  it.each(["edited", "dismissed"])(
    "river labeln vid review-%s även när submitted_at är äldre än sign-off",
    (eventAction) => {
      const result = decideMergeReadyAction(
        input({ eventAction, eventAt: "2026-07-29T11:00:00Z" }),
      );
      expect(result.action).toBe("remove");
      expect(result.reason).toContain("signera igen");
    },
  );

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

  it("behåller labeln för GitHub Actions rena state-kommentar", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "issue_comment",
        senderLogin: "github-actions[bot]",
        eventBody:
          "Automatisk PR-granskare\n<!-- sajtmaskin-pr-review-state:v1:eyJmaW5kaW5ncyI6W119 -->",
      }),
    );

    expect(result.action).toBe("keep");
    expect(result.reason).toContain("state-kommentar");
  });

  it("river labeln för GitHub Actions fynd efter sign-off", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "pull_request_review_comment",
        senderLogin: "github-actions[bot]",
        eventBody: "P1: behörighetskontrollen saknas",
      }),
    );

    expect(result.action).toBe("remove");
    expect(result.reason).toContain("efter sign-off");
  });

  it("river labeln fail-closed för en okänd GitHub Actions-kommentar", () => {
    const result = decideMergeReadyAction(
      input({
        eventName: "issue_comment",
        senderLogin: "github-actions",
        eventBody: "Okänd automationskommentar utan den tillåtna state-markören",
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
    // 900 ms är nyare än 500 ms och måste därför ogiltigförklara sign-offen.
    expect(result.action).toBe("remove");
  });

  it("river labeln fail-closed när händelsen har exakt samma tidsstämpel", () => {
    const result = decideMergeReadyAction(
      input({
        comments: [{ body: signoff(), createdAt: "2026-07-29T12:00:00.500Z" }],
        eventAt: "2026-07-29T12:00:00.500Z",
      }),
    );
    expect(result.action).toBe("remove");
  });

  it("river labeln när en tidsstämpel inte går att tolka", () => {
    const result = decideMergeReadyAction(input({ eventAt: "inte-ett-datum" }));
    expect(result.action).toBe("remove");
    expect(result.reason).toContain("jämföra tidpunkter");
  });

  it("matchar sign-off med bindestreck och kolon, inte bara em-dash", () => {
    for (const separator of ["—", "–", "-", ":"]) {
      const line = `merge:ready ${separator} head-sha: ${HEAD}, base-sha: ${BASE}, at: 2026-07-29T12:00:00Z, bugkoll: bugbot, triage: klar, P0/P1: 0`;
      const result = decideMergeReadyAction(
        input({
          comments: [{ body: line, createdAt: "2026-07-29T12:00:00Z" }],
          eventAt: "2026-07-29T11:59:00Z",
        }),
      );
      expect(result.action, `separator ${separator}`).toBe("keep");
    }
  });

  it("godkänner bara en mänsklig PR-författare eller betrodd repo-collaborator", () => {
    const author = validateMergeReadySignoff(input());
    expect(author.valid).toBe(true);

    for (const authorAssociation of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      const collaborator = validateMergeReadySignoff(
        input({
          comments: [
            {
              body: signoff(),
              createdAt: "2026-07-29T12:00:00Z",
              authorLogin: "trusted-maintainer",
              authorType: "User",
              authorAssociation,
            },
          ],
        }),
      );
      expect(collaborator.valid, authorAssociation).toBe(true);
    }
  });

  it("avvisar sign-off från extern kommentator även när raden och SHA:na är rätt", () => {
    const result = validateMergeReadySignoff(
      input({
        comments: [
          {
            body: signoff(),
            createdAt: "2026-07-29T12:00:00Z",
            authorLogin: "drive-by-reviewer",
            authorType: "User",
            authorAssociation: "CONTRIBUTOR",
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("varken PR-författare eller betrodd");
  });

  it.each([
    ["github-actions[bot]", "Bot", "MEMBER"],
    ["some-app[bot]", "Bot", "OWNER"],
    ["", "", "OWNER"],
  ])(
    "avvisar bot eller saknad identitet för sign-off (%s)",
    (authorLogin, authorType, authorAssociation) => {
      const result = validateMergeReadySignoff(
        input({
          comments: [
            {
              body: signoff(),
              createdAt: "2026-07-29T12:00:00Z",
              authorLogin,
              authorType,
              authorAssociation,
            },
          ],
        }),
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("mänsklig GitHub-användare");
    },
  );

  it("kräver att sign-offen postas efter review-fönstret och senast slutförda bot", () => {
    const tooEarly = validateMergeReadySignoff(
      input({ minimumSignoffCreatedAt: "2026-07-29T12:00:01Z" }),
    );
    expect(tooEarly.valid).toBe(false);
    expect(tooEarly.reason).toContain("innan granskningsfönstret");

    const current = validateMergeReadySignoff(
      input({ minimumSignoffCreatedAt: "2026-07-29T11:59:59Z" }),
    );
    expect(current.valid).toBe(true);

    const ambiguousSameSecond = validateMergeReadySignoff(
      input({ minimumSignoffCreatedAt: "2026-07-29T12:00:00Z" }),
    );
    expect(ambiguousSameSecond.valid).toBe(false);
  });

  it("required-valideraren kräver live label och failar på ogiltig minimitid", () => {
    expect(validateMergeReadySignoff(input({ labels: [] })).valid).toBe(false);
    const invalidMinimum = validateMergeReadySignoff(
      input({ minimumSignoffCreatedAt: "inte-en-tid" }),
    );
    expect(invalidMinimum.valid).toBe(false);
    expect(invalidMinimum.reason).toContain("minimitid");
  });

  it("accepterar bara ett exakt head/base-bundet merge:execute från collaborator", () => {
    const body = `merge:execute — head-sha: ${HEAD}, base-sha: ${BASE}, at: 2026-07-29T12:10:00Z, bugkoll: bugbot, triage: klar, P0/P1: 0`;
    expect(
      validateMergeExecuteMandate({
        body,
        createdAt: "2026-07-29T12:10:01Z",
        authorLogin: "maintainer",
        authorType: "User",
        authorAssociation: "COLLABORATOR",
        headSha: HEAD,
        baseSha: BASE,
      }).valid,
    ).toBe(true);
    expect(
      validateMergeExecuteMandate({
        body,
        createdAt: "2026-07-29T12:10:01Z",
        authorLogin: "pr-author",
        authorType: "User",
        authorAssociation: "NONE",
        headSha: HEAD,
        baseSha: BASE,
      }).reason,
    ).toContain("OWNER/MEMBER/COLLABORATOR");
    expect(
      validateMergeExecuteMandate({
        body: `${body}\nmerge gärna`,
        createdAt: "2026-07-29T12:10:01Z",
        authorLogin: "maintainer",
        authorType: "User",
        authorAssociation: "OWNER",
        headSha: HEAD,
        baseSha: BASE,
      }).valid,
    ).toBe(false);
  });

  it("trådar sender och event-body säkert från workflowens eventfil", () => {
    const workflow = readFileSync(".github/workflows/merge-ready-freshness.yml", "utf8");

    expect(workflow).toContain("GITHUB_EVENT_PATH");
    expect(workflow).toContain("EVENT_ACTION: ${{ github.event.action }}");
    expect(workflow).toContain("EVENT_LABEL: ${{ github.event.label.name }}");
    expect(workflow).toContain('.comment.body // .review.body // ""');
    expect(workflow).toContain('--arg eventAction "$EVENT_ACTION"');
    expect(workflow).toContain('--arg eventLabel "$EVENT_LABEL"');
    expect(workflow).toContain('--arg senderLogin "$SENDER"');
    expect(workflow).toContain('--arg eventBody "$EVENT_BODY"');
    expect(workflow).toContain("senderLogin: $senderLogin");
    expect(workflow).toContain("eventBody: $eventBody");
    expect(workflow).toContain("eventLabel: $eventLabel");
    expect(workflow).toContain("baseSha: $baseSha");
    expect(workflow).toContain('authorLogin: (.user.login // "")');
    expect(workflow).toContain('authorAssociation: (.author_association // "")');
    expect(workflow).not.toContain("${{ github.event.comment.body }}");
    expect(workflow).not.toMatch(/^  pull_request_review(?:_comment)?:/m);
    expect(workflow).not.toContain("review-event-listener");
    expect(workflow).toContain("node scripts/ci/trusted-review-window.mjs merge");
    expect(workflow).toContain("startsWith(github.event.comment.body, 'merge:execute')");
  });

  it("kör label-skrivningar från betrodd default-branch och täcker master-push", () => {
    const workflow = readFileSync(".github/workflows/merge-ready-freshness.yml", "utf8");

    expect(workflow).toContain("pull_request_target:");
    expect(workflow).toMatch(
      /pull_request_target:[\s\S]*?types:\s*\[\s*opened,\s*synchronize,\s*reopened,\s*edited,\s*ready_for_review,\s*converted_to_draft,\s*labeled,\s*unlabeled,?\s*\]/,
    );
    expect(workflow).toContain("github.event.label.name == 'merge:ready'");
    expect(workflow).toContain("github.event_name != 'pull_request_target'");
    expect(workflow).toContain("BASE_REF=$(printf '%s' \"$pr_json\" | jq -r '.base.ref')");
    expect(workflow).toContain("git/ref/heads/${BASE_REF}");
    expect(workflow).toContain("compare/${BASE_SHA}...${HEAD_SHA}");
    expect(workflow).toContain(".merge_base_commit.sha");
    expect(workflow).not.toContain("jq -r '.base.sha'");
    expect(workflow).toContain('--arg baseSha "$BASE_SHA"');
    expect(workflow).toContain('--argjson baseIsAncestor "$BASE_IS_ANCESTOR"');
    expect(workflow).toContain("baseIsAncestor: $baseIsAncestor");
    expect(workflow).not.toMatch(/\n  pull_request:\n/);
    expect(workflow).toContain("ref: ${{ github.event.repository.default_branch }}");
    expect(workflow).toContain("invalidate-on-master-push:");
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("node scripts/ci/trusted-review-window.mjs gate");
    expect(workflow).toContain("node scripts/ci/trusted-review-window.mjs invalidate-base");
    expect(workflow).toContain("checks: write");
    expect(workflow).not.toContain("github.event.sender.login != 'github-actions[bot]'");
  });
});
