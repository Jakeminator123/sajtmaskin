import { describe, expect, it } from "vitest";
import {
  isOpenClawPreparedPromptStructured,
  isOpenClawPreparedSend,
  OPENCLAW_BUILDER_CHAT_TARGET,
  OPENCLAW_PREPARED_PROMPT_SOURCE,
  resolveOpenClawPreparedPromptSource,
} from "./prepared-prompt";

/** A realistic OpenClaw-prepared follow-up: labeled sections + bullet lists. */
const STRUCTURED_PROMPT = `Uppdatera sajten med en ny sektion för kundcase på startsidan.

Mål:
- Lyfta fram tre kundcase med citat och mätbara resultat
- Öka trovärdigheten direkt under hero-sektionen

Sektioner:
- Kundcase-grid med tre kort (logotyp, citat, resultatsiffra)
- CTA-band under griden med knappen "Boka demo"

Design:
- Behåll nuvarande färgpalett och typografi
- Korten får mjuka skuggor och rundade hörn`;

describe("isOpenClawPreparedPromptStructured (deterministisk validator)", () => {
  it("godkänner en strukturerad prompt med etikettrader och punktlistor", () => {
    expect(isOpenClawPreparedPromptStructured(STRUCTURED_PROMPT)).toBe(true);
  });

  it("godkänner markdown-rubriker med numrerad lista", () => {
    const prompt = [
      "# Gör om produktsidan",
      "Beskrivning av önskad omgörning av produktsidan med fokus på konvertering.",
      "## Innehåll",
      "1. Hero med produktbild och tydlig CTA-knapp högst upp",
      "2. Jämförelsetabell mellan de tre paketen med priser",
      "3. FAQ-sektion med de sex vanligaste frågorna",
      "## Ton",
      "Varm och rak, korta meningar, svenska rubriker rakt igenom hela sidan.",
    ].join("\n");
    expect(prompt.length).toBeGreaterThanOrEqual(200);
    expect(isOpenClawPreparedPromptStructured(prompt)).toBe(true);
  });

  it("avvisar en kort prompt även om den har struktur", () => {
    const prompt = "Mål:\n- Mörkt tema\n- Större rubriker\n- Ny font\nDesign:";
    expect(isOpenClawPreparedPromptStructured(prompt)).toBe(false);
  });

  it("avvisar lång men ostrukturerad flytext utan sektioner och punkter", () => {
    const prompt =
      "Jag skulle vilja att sajten känns lite modernare och mer inbjudande överlag, " +
      "kanske med ett mörkare tema och lite större rubriker så att besökaren direkt " +
      "förstår vad företaget erbjuder, och gärna en tydligare knapp för att boka en " +
      "demo någonstans högt upp på sidan om det går att lösa på ett snyggt sätt.";
    expect(prompt.length).toBeGreaterThanOrEqual(200);
    expect(isOpenClawPreparedPromptStructured(prompt)).toBe(false);
  });

  it("avvisar när sektionssignalerna är för få (en etikett räcker inte)", () => {
    const prompt = [
      "Ändringar:",
      "- Byt hero-bilden mot en bild på verkstaden i kvällsljus med varm ton",
      "- Lägg till en sektion med tre kundrecensioner och stjärnbetyg under hero",
      "- Uppdatera sidfoten med öppettider för helger och röda dagar",
      "Allt annat på sidan ska lämnas helt orört tills vidare.",
    ].join("\n");
    expect(prompt.length).toBeGreaterThanOrEqual(200);
    expect(isOpenClawPreparedPromptStructured(prompt)).toBe(false);
  });

  it("avvisar när punktlistan är för kort (två punkter räcker inte)", () => {
    const prompt = [
      "Mål:",
      "- Gör om startsidans hero-sektion med en mörkare bakgrundston och ny bild",
      "Design:",
      "- Behåll typografin men öka kontrasten på knappar och länkar i menyn",
      "Resten av sajten ska behållas exakt som den ser ut i nuvarande version.",
    ].join("\n");
    expect(prompt.length).toBeGreaterThanOrEqual(200);
    expect(isOpenClawPreparedPromptStructured(prompt)).toBe(false);
  });

  it("avvisar tom och whitespace-only input", () => {
    expect(isOpenClawPreparedPromptStructured("")).toBe(false);
    expect(isOpenClawPreparedPromptStructured("   \n\n  ")).toBe(false);
  });

  it("hanterar CRLF-radbrytningar som LF", () => {
    expect(
      isOpenClawPreparedPromptStructured(STRUCTURED_PROMPT.replaceAll("\n", "\r\n")),
    ).toBe(true);
  });
});

describe("resolveOpenClawPreparedPromptSource (klient-tagbeslut)", () => {
  const preparedFill = {
    target: OPENCLAW_BUILDER_CHAT_TARGET,
    value: STRUCTURED_PROMPT,
  };

  it("sätter taggen när editEnabled är på och innehållet är oredigerat", () => {
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill,
        message: STRUCTURED_PROMPT,
        hasAttachments: false,
      }),
    ).toBe(OPENCLAW_PREPARED_PROMPT_SOURCE);
  });

  it("tolererar whitespace-skillnad i kanterna (trim), inte i innehållet", () => {
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill,
        message: `${STRUCTURED_PROMPT}\n`,
        hasAttachments: false,
      }),
    ).toBe(OPENCLAW_PREPARED_PROMPT_SOURCE);
  });

  it("sätter INTE taggen när editEnabled är av", () => {
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: false,
        preparedFill,
        message: STRUCTURED_PROMPT,
        hasAttachments: false,
      }),
    ).toBeNull();
  });

  it("sätter INTE taggen när användaren redigerat innehållet före send", () => {
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill,
        message: `${STRUCTURED_PROMPT}\n\nOch byt även font på rubrikerna.`,
        hasAttachments: false,
      }),
    ).toBeNull();
  });

  it("sätter INTE taggen utan registrerad fyllning", () => {
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill: null,
        message: STRUCTURED_PROMPT,
        hasAttachments: false,
      }),
    ).toBeNull();
  });

  it("sätter INTE taggen för en fyllning mot en annan target", () => {
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill: { target: "landing.freeform.primary", value: STRUCTURED_PROMPT },
        message: STRUCTURED_PROMPT,
        hasAttachments: false,
      }),
    ).toBeNull();
  });

  it("sätter INTE taggen när bilagor eller bilage-prompt följer med", () => {
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill,
        message: STRUCTURED_PROMPT,
        hasAttachments: true,
      }),
    ).toBeNull();
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill,
        message: STRUCTURED_PROMPT,
        hasAttachments: false,
        attachmentPrompt: "Använd bifogad bild som referens.",
      }),
    ).toBeNull();
  });
});

// Vad en förfalskad tagg kan köpa. Taggen är ett fritt fält i requesten, så
// den bevisar ingenting — därför måste varje spärr som spelar roll ligga i
// kontroller klienten inte styr. Testerna nedan är den påståendet i kodform.
describe("prepared-prompt — taggen är en ledtråd, inte ett intyg", () => {
  const STRUCTURED = [
    "Design:",
    "- Mörk editorial-stil med hög kontrast",
    "- Serif-rubriker, generöst luftrum",
    "- Sticky header med genomskinlig bakgrund",
    "Sektioner:",
    "- Hero med stort citat",
    "- Tre utvalda case",
    "- Kontaktformulär längst ned",
    "Ton: sparsmakad, redaktionell, inga utropstecken i copyn alls.",
  ].join("\n");

  it("en spoofad tagg på ostrukturerad text passerar inte validatorn", () => {
    // Servern grindar på strukturen, inte på taggen: den som ljuger om
    // ursprunget får ändå inget om texten inte redan är en brief.
    expect(isOpenClawPreparedPromptStructured("Gör om sajten helt, snyggare och modernare tack.")).toBe(
      false,
    );
  });

  it("en giltig strukturerad prompt passerar oavsett vem som påstås ha skrivit den", () => {
    expect(isOpenClawPreparedPromptStructured(STRUCTURED)).toBe(true);
  });

  it("ändrad text bryter tagen — bindningen är innehållet, inte fyllningen", () => {
    const preparedFill = { target: OPENCLAW_BUILDER_CHAT_TARGET, value: STRUCTURED };
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill,
        message: STRUCTURED + "\n- Och lägg till en prislista",
        hasAttachments: false,
      }),
    ).toBeNull();
  });

  it("replay: en konsumerad fyllning kan inte tagga ett andra utskick av samma text", () => {
    const preparedFill = { target: OPENCLAW_BUILDER_CHAT_TARGET, value: STRUCTURED };
    // Första utskicket taggas…
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill,
        message: STRUCTURED,
        hasAttachments: false,
      }),
    ).toBe(OPENCLAW_PREPARED_PROMPT_SOURCE);
    // …och markören släpps av composern efter utskicket (engångs), så nästa
    // identiska send saknar fyllning och går otaggat.
    expect(
      resolveOpenClawPreparedPromptSource({
        editEnabled: true,
        preparedFill: null,
        message: STRUCTURED,
        hasAttachments: false,
      }),
    ).toBeNull();
  });
});

describe("isOpenClawPreparedSend (vem startade sändningen)", () => {
  const preparedFill = {
    target: OPENCLAW_BUILDER_CHAT_TARGET,
    value: "Gör hjältesektionen luftigare",
  };

  it("känner igen sändningen även när composern hängt på ett Figma-block", () => {
    // Bindningen av send-id:t frågar VEM som startade turen, inte om texten är
    // orörd — annars blir en armerad auto-send obunden så fort en Figma-länk
    // ligger i composern, och dess egen avvisning kan inte matchas.
    const message = `${preparedFill.value}\n\nUse this Figma design as a reference: https://figma.test/x`;
    expect(isOpenClawPreparedSend({ preparedFill, message })).toBe(true);
  });

  it("nekar en katalog-/handskriven sändning som råkar ske i samma fönster", () => {
    // Den här riktningen är den farliga: en främmande sändning som binder
    // watchen gör att autonomins EGEN avvisning inte matchar, och mandatet
    // fortsätter som om steget lyckats.
    expect(
      isOpenClawPreparedSend({ preparedFill, message: "Lägg till Stripe-betalningar" }),
    ).toBe(false);
  });

  it("nekar när ingen fill finns eller när den gäller ett annat fält", () => {
    expect(isOpenClawPreparedSend({ preparedFill: null, message: preparedFill.value })).toBe(
      false,
    );
    expect(
      isOpenClawPreparedSend({
        preparedFill: { target: "landing.freeform.primary", value: preparedFill.value },
        message: preparedFill.value,
      }),
    ).toBe(false);
  });

  it("nekar en tom fill, som annars skulle matcha varje sändning", () => {
    expect(
      isOpenClawPreparedSend({
        preparedFill: { target: OPENCLAW_BUILDER_CHAT_TARGET, value: "   " },
        message: "Lägg till en prissektion",
      }),
    ).toBe(false);
  });
});
