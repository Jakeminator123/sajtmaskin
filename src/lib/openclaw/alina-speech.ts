const marker = "[ALINA-TAL]";

export const ALINA_SPEECH_PROMPT =
  "Svara som vanligt med fullständig text och eventuella åtgärder. Vid långa svar (över 300 tecken) " +
  "ska du allra sist, på en egen rad efter alla åtgärder, skriva [ALINA-TAL] följt av en separat " +
  "muntlig sammanfattning på svenska. Ge slutsatsen och det viktigaste i högst fyra korta meningar. " +
  "Skriv varken rubriker, kod eller länkar i taldelen. Korta svar har ingen taldel.";

export function splitAlinaSpeech(raw: string) {
  const index = raw.lastIndexOf("\n" + marker);
  if (index >= 0 && (raw.slice(0, index).match(/^`{3,}/gm)?.length ?? 0) % 2 === 0) {
    return { full: raw.slice(0, index).trimEnd(), spoken: raw.slice(index + marker.length + 1).trim() };
  }
  const line = raw.lastIndexOf("\n");
  const tail = raw.slice(line + 1);
  const partial = line >= 0 && tail.startsWith("[") && marker.startsWith(tail);
  return { full: partial ? raw.slice(0, line) : raw, spoken: "" };
}

export function alinaSpeechVersion(full: string, spoken?: string) {
  const summary = !!spoken || full.length > 300;
  if (!summary) return { text: full, summary: false };
  const plain = (spoken || full).replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "")
    .replace(/^(?:[ \t]*(?:#{1,6}|[-*>]|\d+[.)])[ \t]+)+/gm, "").replace(/[*_`]/g, "").trim();
  const segmenter = new Intl.Segmenter("sv", { granularity: "sentence" });
  const sentences: string[] = [];
  for (const line of plain.split(/\n+/)) {
    for (const {segment} of segmenter.segment(line)) {
      const sentence = segment.trim();
      if (!sentence || sentence.length > 130 || sentence.split(/\s+/).length > 22) continue;
      if (sentences.join(" ").length + sentence.length > 410) break;
      sentences.push(/[.!?…]$/.test(sentence) ? sentence : sentence + ".");
      if (sentences.length === 4) break;
    }
    if (sentences.length === 4) break;
  }
  if (!sentences.length && spoken) return alinaSpeechVersion(full);
  return { text: sentences.join(" ") || "Detaljerna finns i mitt svar i chatten.", summary: true };
}
