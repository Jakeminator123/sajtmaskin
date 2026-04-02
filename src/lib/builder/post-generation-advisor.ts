import type { ChatMessage } from "@/lib/builder/types";

type AdvisorSuggestion = {
  label: string;
  prompt: string;
};

function collectUserContext(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n")
    .toLowerCase();
}

function countVersions(messages: ChatMessage[]): number {
  return messages.filter((m) => m.id.startsWith("advisor-")).length;
}

function buildAdvisorSuggestions(context: string, isFollowUp: boolean): AdvisorSuggestion[] {
  const suggestions: AdvisorSuggestion[] = [];

  if (/\b(boka|bokning|kalender|tid)\b/i.test(context)) {
    suggestions.push({
      label: "Förbättra bokning",
      prompt: "Förbättra bokningsflödet och gör CTA:n tydligare på de viktigaste delarna av sajten.",
    });
  }

  if (/\b(restaurang|meny|mat|cafe)\b/i.test(context)) {
    suggestions.push({
      label: "Lyft meny och öppettider",
      prompt: "Lyft meny, öppettider och bordsbokning tydligare så att besökaren snabbare kan agera.",
    });
  }

  if (/\b(portfolio|fotograf|designer|byrå|byra|konsult|case|referens)\b/i.test(context)) {
    suggestions.push({
      label: "Gör jobbet mer övertygande",
      prompt: "Förstärk sajten med tydligare case, resultat och social proof där det passar.",
    });
  }

  if (/\b(shop|e-handel|produkt|produkter|köp|kop|webshop)\b/i.test(context)) {
    suggestions.push({
      label: "Förbättra produktsidor",
      prompt: "Gör produkterna enklare att jämföra och stärk köpflödet med tydligare argument och CTA.",
    });
  }

  if (isFollowUp) {
    suggestions.push(
      {
        label: "Lägg till en ny sida",
        prompt: "Lägg till en ny undersida som saknas — t.ex. Om oss, Kontakt eller Blogg.",
      },
      {
        label: "Ladda upp egna bilder",
        prompt: "Jag vill byta ut stockbilder mot mina egna bilder.",
      },
      {
        label: "Publicera",
        prompt: "Jag är nöjd — hjälp mig publicera sajten.",
      },
    );
  } else {
    suggestions.push(
      {
        label: "Skapa mer förtroende",
        prompt: "Gör sajten mer trovärdig med starkare rubriker, referenser och tydligare struktur.",
      },
      {
        label: "Vassa innehållet",
        prompt: "Förbättra copy, struktur och CTA så att sajten blir tydligare och mer övertygande.",
      },
      {
        label: "Förbättra konvertering",
        prompt: "Optimera första intrycket och CTA-flödet så att fler besökare tar nästa steg.",
      },
    );
  }

  const deduped = new Map<string, AdvisorSuggestion>();
  for (const s of suggestions) {
    if (!deduped.has(s.prompt)) deduped.set(s.prompt, s);
  }

  return Array.from(deduped.values()).slice(0, 3);
}

export function buildPostGenerationAdvisorMessage(
  messages: ChatMessage[],
  versionId: string,
): ChatMessage {
  const context = collectUserContext(messages);
  const isFollowUp = countVersions(messages) > 0;
  const suggestions = buildAdvisorSuggestions(context, isFollowUp);
  const summary = suggestions.map((s) => `- ${s.label}`).join("\n");

  const intro = isFollowUp
    ? "Ändringarna är klara! Här är vad jag skulle göra härnäst:"
    : "Första versionen är uppe! Jag skulle ta den vidare med:";

  return {
    id: `advisor-${versionId}`,
    role: "assistant",
    content: [intro, "", summary, "", "Vad vill du göra?"].join("\n"),
    isHelpMessage: true,
    uiParts: [
      {
        type: "tool:awaiting-input",
        toolName: "Rådgivare",
        toolCallId: `advisor:${versionId}`,
        state: "input-available",
        kind: "advisor-follow-up",
        output: {
          question: "Vad vill du göra?",
          options: suggestions.map((s) => s.label),
          suggestedPrompts: suggestions.map((s) => s.prompt),
          kind: "advisor-follow-up",
          awaitingInput: true,
        },
      },
    ],
  };
}
