import { describe, expect, it } from "vitest";
import {
  classifyFollowUpIntent,
  resolveFollowUpClarification,
} from "@/lib/providers/own-engine/follow-up-clarification";
import {
  classifyRequestKind,
  requestKindClassificationFields,
} from "./request-kind";

describe("classifyRequestKind", () => {
  it("returns unclassified for empty input", () => {
    expect(classifyRequestKind("")).toEqual({
      kind: "unclassified",
      source: "regex",
      signals: {
        hasQaHint: false,
        hasQuestionMark: false,
        hasChangeVerb: false,
        hasScoreHint: false,
      },
      questionShape: "none",
    });
  });

  it("detects integration when setup verb and provider co-occur", () => {
    expect(classifyRequestKind("Sätt upp Stripe checkout").kind).toBe("integration");
    expect(classifyRequestKind("Koppla in Supabase som databas").kind).toBe("integration");
  });

  it("detects redesign from strong phrases", () => {
    expect(classifyRequestKind("Gör om sajten from scratch").kind).toBe("redesign");
    expect(classifyRequestKind("Total redesign av hero").kind).toBe("redesign");
  });

  it("detects external-fetch for URLs or fetch phrasing", () => {
    expect(classifyRequestKind("Hämta färgtema från https://example.com").kind).toBe(
      "external-fetch",
    );
    expect(classifyRequestKind("Scrape pricing från konkurrent").kind).toBe("external-fetch");
  });

  it("detects multi-change with och between verbs", () => {
    expect(classifyRequestKind("Byt hero-bilden och uppdatera footern").kind).toBe(
      "multi-change",
    );
  });

  it("detects multi-change when the leading verb starts with a non-ASCII letter", () => {
    // ASCII \b never matches before `ä` (non-word in default tables), so the
    // previous pattern silently downgraded these to `unclassified`.
    expect(classifyRequestKind("Ändra färg och flytta knappen").kind).toBe("multi-change");
  });

  it("detects qa-or-score without imperative edit verbs", () => {
    expect(classifyRequestKind("Hur promptar jag för parallax?").kind).toBe("qa-or-score");
    expect(classifyRequestKind("Ge ett betyg på designen?").kind).toBe("qa-or-score");
  });

  it("does not mistake an imperative score display edit for a score question", () => {
    expect(classifyRequestKind("Visa poäng i headern").kind).not.toBe("qa-or-score");
    expect(classifyRequestKind("Kan du visa poängen i headern?").kind).not.toBe(
      "qa-or-score",
    );
    expect(
      classifyRequestKind("Visa poäng i headern när användaren är inloggad").kind,
    ).not.toBe("qa-or-score");
    expect(
      classifyRequestKind("Visa poäng i headern när sajten är publicerad").kind,
    ).not.toBe("qa-or-score");
    expect(
      classifyRequestKind("Visa poäng i headern och förklara varför den är låg").kind,
    ).not.toBe("qa-or-score");
    expect(
      classifyRequestKind("Visa poäng i vilken färg som helst i headern").kind,
    ).not.toBe("qa-or-score");
    expect(
      classifyRequestKind(
        "Visa poäng när användaren är inloggad, högst upp i headern",
      ).kind,
    ).not.toBe("qa-or-score");
    expect(
      classifyRequestKind(
        "Hur kan jag visa poäng i headern? Visa poäng i footern.",
      ).kind,
    ).not.toBe("qa-or-score");
    expect(
      classifyRequestKind("När användaren är inloggad, visa poängen i headern.").kind,
    ).not.toBe("qa-or-score");
    expect(
      classifyRequestKind("När användaren är inloggad, visa poängen i headern").kind,
    ).not.toBe("qa-or-score");
  });

  it("keeps genuine score questions in the qa path", () => {
    expect(classifyRequestKind("Vad är sajtens poäng?").kind).toBe("qa-or-score");
    expect(classifyRequestKind("Vad visar poängen?").kind).toBe("qa-or-score");
    expect(classifyRequestKind("Visa mig sajtens poäng").kind).toBe("qa-or-score");
    expect(classifyRequestKind("Hur kan jag visa poäng i headern?").kind).toBe(
      "qa-or-score",
    );
    expect(
      classifyRequestKind("Kan du visa varför poängen i headern är låg?").kind,
    ).toBe("qa-or-score");
  });

  it("does not label imperative edits as qa", () => {
    expect(classifyRequestKind("Hur ändrar jag färgen till blå?").kind).not.toBe("qa-or-score");
  });

  it("detects page-addition", () => {
    expect(classifyRequestKind("Lägg till en sida /om-oss med teamet").kind).toBe(
      "page-addition",
    );
  });

  it("detects local-layout", () => {
    expect(classifyRequestKind("Flytta features-blocket före pricing").kind).toBe(
      "local-layout",
    );
  });

  it("detects micro-edit for short color-focused prompts", () => {
    expect(classifyRequestKind("Byt primärfärg till #ea580c").kind).toBe("micro-edit");
  });

  it("does not classify any path mention as page-addition", () => {
    expect(classifyRequestKind("Ändra något i /api/foo så att det funkar").kind).not.toBe(
      "page-addition",
    );
  });

  it("treats 'var' positioning prompt as edit-intent, not qa-or-score", () => {
    expect(classifyRequestKind("Var ska jag lägga den här knappen?").kind).not.toBe(
      "qa-or-score",
    );
  });

  it("still classifies real questions starting with 'hur' as qa-or-score", () => {
    expect(classifyRequestKind("Hur fungerar din pipeline?").kind).toBe("qa-or-score");
  });

  // 2026-04-22 audit (rapport 05): "trea" var en typo — cardinal "tre"
  // matchade aldrig, så "tre ändringar" föll silent till local-layout.
  it("detects multi-change when the prompt says 'tre ändringar'", () => {
    expect(
      classifyRequestKind("Gör tre ändringar: byt hero-bild, lägg till CTA, flytta testimonials").kind,
    ).toBe("multi-change");
  });
});

describe("requestKind questionShape (telemetry only — never changes kind)", () => {
  it("marks a QA word without '?' as qa-hint-no-mark and keeps kind unclassified", () => {
    const result = classifyRequestKind("vad är klockan i Paris");
    expect(result.kind).toBe("unclassified");
    expect(result.questionShape).toBe("qa-hint-no-mark");
    expect(result.signals).toEqual({
      hasQaHint: true,
      hasQuestionMark: false,
      hasChangeVerb: false,
      hasScoreHint: false,
    });
  });

  it("keeps the existing qa-or-score gate for the same prompt with '?'", () => {
    const result = classifyRequestKind("vad är klockan i Paris?");
    expect(result.kind).toBe("qa-or-score");
    expect(result.questionShape).toBe("qa-or-score");
  });

  it("does not classify build-in-question-form as qa-or-score", () => {
    expect(classifyRequestKind("kan du lägga till en footer?").kind).not.toBe("qa-or-score");
    expect(classifyRequestKind("går det att byta färg?").kind).not.toBe("qa-or-score");
    expect(classifyRequestKind("hur lägger jag till en kontaktform?").kind).not.toBe(
      "qa-or-score",
    );
    expect(classifyRequestKind("hur lägger jag till en kontaktform?").questionShape).toBe(
      "qa-hint-blocked-by-verb",
    );
  });

  it("exposes the same flat fields the classified log writes", () => {
    const result = classifyRequestKind("vad är klockan i Paris");
    expect(requestKindClassificationFields(result)).toEqual({
      kind: "unclassified",
      source: "regex",
      questionShape: "qa-hint-no-mark",
      hasQaHint: true,
      hasQuestionMark: false,
      hasChangeVerb: false,
      hasScoreHint: false,
    });
  });
});

describe("build-vs-question path (today's follow-up classifiers)", () => {
  it("locks the owner examples so measurement cannot silently change kind", () => {
    const rows = [
      "vad är klockan i Paris",
      "vad är klockan i Paris?",
      "varför blev sidan blå?",
      "hur lägger jag till en kontaktform?",
      "vad kostar det här?",
      "kan du lägga till en footer?",
      "går det att byta färg?",
    ].map((message) => ({
      message,
      followUpIntent: classifyFollowUpIntent(message),
      clarification: resolveFollowUpClarification(message)?.reason ?? null,
      requestKind: classifyRequestKind(message).kind,
      questionShape: classifyRequestKind(message).questionShape,
    }));

    expect(rows).toEqual([
      {
        message: "vad är klockan i Paris",
        followUpIntent: "neutral",
        clarification: null,
        requestKind: "unclassified",
        questionShape: "qa-hint-no-mark",
      },
      {
        message: "vad är klockan i Paris?",
        followUpIntent: "neutral",
        clarification: null,
        requestKind: "qa-or-score",
        questionShape: "qa-or-score",
      },
      {
        message: "varför blev sidan blå?",
        followUpIntent: "neutral",
        clarification: null,
        requestKind: "qa-or-score",
        questionShape: "qa-or-score",
      },
      {
        message: "hur lägger jag till en kontaktform?",
        followUpIntent: "neutral",
        clarification: null,
        requestKind: "unclassified",
        questionShape: "qa-hint-blocked-by-verb",
      },
      {
        message: "vad kostar det här?",
        followUpIntent: "neutral",
        clarification: null,
        requestKind: "qa-or-score",
        questionShape: "qa-or-score",
      },
      {
        message: "kan du lägga till en footer?",
        followUpIntent: "neutral",
        clarification: null,
        requestKind: "unclassified",
        questionShape: "none",
      },
      {
        message: "går det att byta färg?",
        followUpIntent: "neutral",
        clarification: null,
        requestKind: "micro-edit",
        questionShape: "none",
      },
    ]);
  });
});
