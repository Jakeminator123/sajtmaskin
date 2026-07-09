import { describe, expect, it } from "vitest";
import {
  readFaqItemsDraft,
  updateFaqItemsDraft,
  type FaqItemDraft,
} from "./faq-editor";

describe("faq-editor", () => {
  describe("readFaqItemsDraft", () => {
    it("reads question/answer pairs from page files", () => {
      const content = [
        "const faqs = [",
        "  { question: 'What is this?', answer: 'A product.' },",
        "  { question: 'How does it work?', answer: 'Simply.' },",
        "];",
      ].join("\n");
      expect(readFaqItemsDraft("app/page.tsx", content)).toEqual([
        { question: "What is this?", answer: "A product." },
        { question: "How does it work?", answer: "Simply." },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "const faqs = [",
        "  { question: 'Q', answer: 'A' },",
        "  { question: 'Q2', answer: 'A2' },",
        "];",
      ].join("\n");
      expect(readFaqItemsDraft("components/faq.tsx", content)).toBeNull();
    });

    it("does not leak sibling question-only objects into answer fields", () => {
      const content = [
        "const quizFragments = [",
        "  { question: 'Utan svar här', hint: 'x' },",
        "];",
        "const faqs = [",
        "  { question: 'Har ni vegetariskt?', answer: 'Ja, varje dag.' },",
        "  { question: 'Kan man ta med?', answer: 'Absolut.' },",
        "];",
      ].join("\n");
      expect(readFaqItemsDraft("app/page.tsx", content)).toEqual([
        { question: "Har ni vegetariskt?", answer: "Ja, varje dag." },
        { question: "Kan man ta med?", answer: "Absolut." },
      ]);
    });

    it("returns null when fewer than two items", () => {
      const content = [
        "const faqs = [",
        "  { question: 'Only one', answer: 'item' },",
        "];",
      ].join("\n");
      expect(readFaqItemsDraft("app/page.tsx", content)).toBeNull();
    });

    it("caps at 10 items", () => {
      const items = Array.from({ length: 12 }, (_, i) =>
        `  { question: 'Q${i}', answer: 'A${i}' },`,
      ).join("\n");
      const content = `const faqs = [\n${items}\n];`;
      const result = readFaqItemsDraft("app/page.tsx", content);
      expect(result).toHaveLength(10);
    });
  });

  describe("updateFaqItemsDraft", () => {
    it("updates question and answer in place", () => {
      const content = [
        "const faqs = [",
        "  { question: 'What is this?', answer: 'A product.' },",
        "  { question: 'How does it work?', answer: 'Simply.' },",
        "];",
      ].join("\n");
      const nextItems: FaqItemDraft[] = [
        { question: "Vad är detta?", answer: "Ett produkt." },
        { question: "Hur fungerar det?", answer: "Enkelt." },
      ];
      const updated = updateFaqItemsDraft(content, nextItems);
      expect(updated).toContain("question: 'Vad är detta?'");
      expect(updated).toContain("answer: 'Ett produkt.'");
      expect(updated).toContain("question: 'Hur fungerar det?'");
      expect(updated).toContain("answer: 'Enkelt.'");
    });

    it("returns content unchanged when no edits", () => {
      const content = [
        "const faqs = [",
        "  { question: 'Q1', answer: 'A1' },",
        "  { question: 'Q2', answer: 'A2' },",
        "];",
      ].join("\n");
      const nextItems: FaqItemDraft[] = [
        { question: "Q1", answer: "A1" },
        { question: "Q2", answer: "A2" },
      ];
      expect(updateFaqItemsDraft(content, nextItems)).toBe(content);
    });
  });
});
