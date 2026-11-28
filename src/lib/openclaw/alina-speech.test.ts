import { expect, it } from "vitest";
import { alinaSpeechVersion, splitAlinaSpeech } from "./alina-speech";

it("keeps code and hides only the separate spoken version during streaming", () => {
  const code = "Exempel\n```txt\n[ALINA-TAL] i koden\n```";
  expect(splitAlinaSpeech(code).full).toBe(code);
  expect(splitAlinaSpeech(code + "\n[ALINA-").full).toBe(code);
  expect(splitAlinaSpeech(code + "\n[ALINA-TAL] Huvudsakligt resultat.")).toEqual({
    full: code, spoken: "Huvudsakligt resultat.",
  });
});

it("keeps significant numbers and caps speech at four short sentences", () => {
  const spoken = "4090 är kortets modellnummer. Testet lyckades. Ljudet är sparat. Videon är klar. En femte mening.";
  expect(alinaSpeechVersion("Hela svaret.", spoken)).toEqual({
    text: "4090 är kortets modellnummer. Testet lyckades. Ljudet är sparat. Videon är klar.", summary: true,
  });
  expect(alinaSpeechVersion("Hej!")).toEqual({text: "Hej!", summary: false});
});
