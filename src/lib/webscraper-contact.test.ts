import { describe, expect, it } from "vitest";
import {
  assembleAggregatedWords,
  extractContactSignals,
  formatContactSummary,
  mergeContactSignals,
} from "./webscraper";

describe("extractContactSignals (G#67/U#43)", () => {
  const html = `
    <html>
      <body>
        <main><p>Vi bygger hemsidor.</p></main>
        <footer>
          <a href="mailto:info@firma.se?subject=Hej">Maila oss</a>
          <a href="tel:+46812345678">Ring oss</a>
          <a href="https://www.facebook.com/firma">Facebook</a>
          <a href="https://instagram.com/firma">Instagram</a>
          <p>Kontakta sales@firma.se direkt.</p>
          <p>Org.nr: 556677-8899. Momsreg SE556677889901.</p>
        </footer>
      </body>
    </html>`;

  it("extracts mailto, tel, social and org number signals", async () => {
    const signals = await extractContactSignals(html, "https://firma.se/kontakt");
    expect(signals.emails).toContain("info@firma.se");
    expect(signals.emails).toContain("sales@firma.se");
    expect(signals.phones).toContain("+46812345678");
    expect(signals.socials).toEqual(
      expect.arrayContaining([
        "https://www.facebook.com/firma",
        "https://instagram.com/firma",
      ]),
    );
    expect(signals.orgNumbers).toContain("556677-8899");
  });

  it("strips the mailto: query string from e-mail addresses", async () => {
    const signals = await extractContactSignals(
      '<a href="mailto:hej@x.se?subject=Offert">Mejl</a>',
      "https://x.se",
    );
    expect(signals.emails).toEqual(["hej@x.se"]);
  });

  it("dedupes repeated signals (case-insensitive for e-mail/social)", async () => {
    const dup = `
      <a href="mailto:Info@Firma.se">a</a>
      <a href="mailto:info@firma.se">b</a>
      <a href="https://facebook.com/firma">f1</a>
      <a href="https://facebook.com/firma">f2</a>`;
    const signals = await extractContactSignals(dup, "https://firma.se");
    expect(signals.emails).toEqual(["Info@Firma.se"]);
    expect(signals.socials).toEqual(["https://facebook.com/firma"]);
  });

  it("returns empty arrays when there are no signals", async () => {
    const signals = await extractContactSignals(
      "<html><body><p>Bara vanlig text utan kontaktuppgifter.</p></body></html>",
      "https://x.se",
    );
    expect(signals).toEqual({ emails: [], phones: [], socials: [], orgNumbers: [] });
  });

  it("does not match a plain phone number as an org number", async () => {
    const signals = await extractContactSignals(
      "<body><p>Ring 08-123 456 78 eller 0812345678.</p></body>",
      "https://x.se",
    );
    expect(signals.orgNumbers).toEqual([]);
  });

  it("returns empty for empty html", async () => {
    expect(await extractContactSignals("")).toEqual({
      emails: [],
      phones: [],
      socials: [],
      orgNumbers: [],
    });
  });
});

describe("mergeContactSignals", () => {
  it("merges and dedupes across pages", () => {
    const merged = mergeContactSignals([
      { emails: ["a@x.se"], phones: ["+4681"], socials: ["https://x.com/a"], orgNumbers: ["556677-8899"] },
      { emails: ["a@x.se", "b@x.se"], phones: ["+4682"], socials: [], orgNumbers: ["556677-8899"] },
    ]);
    expect(merged.emails).toEqual(["a@x.se", "b@x.se"]);
    expect(merged.phones).toEqual(["+4681", "+4682"]);
    expect(merged.socials).toEqual(["https://x.com/a"]);
    expect(merged.orgNumbers).toEqual(["556677-8899"]);
  });
});

describe("formatContactSummary", () => {
  it("renders a labelled block for non-empty signals", () => {
    const summary = formatContactSummary({
      emails: ["info@x.se"],
      phones: ["+4681"],
      socials: ["https://facebook.com/x"],
      orgNumbers: ["556677-8899"],
    });
    expect(summary).toContain("KONTAKT & JURIDIK:");
    expect(summary).toContain("E-post: info@x.se");
    expect(summary).toContain("Telefon: +4681");
    expect(summary).toContain("Org.nr: 556677-8899");
    expect(summary).toContain("Sociala: https://facebook.com/x");
  });

  it("returns an empty string when there is nothing to show", () => {
    expect(formatContactSummary({ emails: [], phones: [], socials: [], orgNumbers: [] })).toBe("");
  });

  it("hard-caps the summary length", () => {
    const summary = formatContactSummary({
      emails: Array.from({ length: 5 }, (_, i) => `verylongemailaddress${i}@example-domain.se`),
      phones: ["+46812345678"],
      socials: ["https://facebook.com/some-very-long-profile-handle-name"],
      orgNumbers: ["556677-8899"],
    });
    expect(summary.length).toBeLessThanOrEqual(300);
  });
});

describe("assembleAggregatedWords (G#67/U#43 regression)", () => {
  it("keeps the contact block at the front even when the body exceeds the cap", () => {
    const bodyWords = Array.from({ length: 5000 }, (_, i) => `word${i}`);
    const summary = "KONTAKT & JURIDIK: E-post: info@x.se.";
    const result = assembleAggregatedWords(summary, bodyWords, 2000);
    expect(result.length).toBe(2000);
    expect(result.slice(0, summary.split(" ").length).join(" ")).toBe(summary);
    // The tail-of-body contact info would otherwise be dropped; here it survives.
    expect(result.join(" ")).toContain("info@x.se");
  });

  it("returns body words sliced to the limit when there is no contact summary", () => {
    const bodyWords = ["a", "b", "c", "d"];
    expect(assembleAggregatedWords("", bodyWords, 2)).toEqual(["a", "b"]);
  });
});
