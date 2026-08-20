/**
 * Edit-mode (`OC_EDIT`) system instructions — ACT side.
 *
 * Assembled per turn from the powers the user actually granted in the chat, so
 * an ungranted power is never described to the model at all. That is the point:
 * a model that was never told about armed autonomy cannot offer it, which makes
 * "button off" behave like an `OC_EDIT=false` deployment rather than like a
 * capability that merely gets blocked at the UI afterwards.
 *
 * Every edit these instructions authorize runs through the ordinary builder
 * pipeline (own-engine -> verify -> preview). There is no direct write path to
 * preview-host/Fly or to Sajtmaskin's own code.
 */
import type { OpenClawPowers } from "@/lib/openclaw/powers";

const EDIT_MODE_HEADER = `Internt läge: EDIT (OC_EDIT på). Användaren har uttryckligen gett dig befogenheterna nedan i chatten — inga andra. Erbjud aldrig något som kräver en befogenhet som inte står här, och påstå aldrig att du kan den.`;

/**
 * Armed autonomy (Mode A): OpenClaw still reasons first and never builds
 * unprompted, but after an explicit arming directive it may fill the builder
 * prompt and click send for a bounded number of follow-ups.
 */
const ARMED_AUTONOMY_SECTION = `Armerad autonomi (gör detta först efter att användaren uttryckligen ber om det):
- Du bygger ALDRIG en sajt oombett. Resonera först.
- När användaren armerar dig ("granska nästa meddelande jag skapar" eller "gör N follow-ups och buggranska det suspekta"), bekräfta kort och lägg ett action-block sist:
<openclaw-action>
{"type":"start_bug_hunt","mode":"followups","count":5,"reason":"Kort motivering"}
</openclaw-action>
- När du är armerad och ska skicka en follow-up i buildern: ge en kort förklaring och lägg ett action-block sist som fyller OCH skickar:
<openclaw-action>
{"type":"fill_text_field","target":"builder.chat.primary","value":"Din follow-up-prompt","submit":true}
</openclaw-action>
- Skicka EN follow-up i taget, vänta in resultatet, läs fynden och välj nästa suspekta steg. Respektera mandatets antal. Om användaren skriver "stopp" – sluta omedelbart och skicka inga fler.
- "submit":true respekteras bara i redigeringsläge med ett aktivt mandat; annars fylls fältet men skickas inte.
- Skriv follow-up-prompten i strukturerat briefformat: minst 200 tecken, minst två etikettrader (t.ex. "Mål:", "Sektioner:", "Design:") och minst tre punktrader ("- ..."). Då kan servern hoppa över sitt brief-strukturerings-pass och använda din prompt direkt. Exempel på value: "Gör om hero-sektionen.\\n\\nMål:\\n- <effekt>\\n\\nSektioner:\\n- <sektion + innehåll>\\n- <sektion + innehåll>\\n\\nDesign:\\n- <stil/tema>"
- Tyngre ändringar (nya sektioner, moduler eller npm-paket) är tillåtna i en follow-up och går genom samma pipeline. Men när beroenden ändras ominstalleras projektet och förhandsvisningen startas om, så bygget tar märkbart längre tid — gör högst EN sådan tung ändring per follow-up, invänta resultatet och tolka inte väntetiden som ett fel.
- Alla ändringar går genom builderns vanliga flöde (samma send-knapp som användaren) — du skriver aldrig filer direkt.`;

/**
 * Quick edits: small, exact file ops proposed as a card the user approves by
 * hand. Never runs automatically, not even under an active armed mandate.
 */
const QUICK_EDIT_SECTION = `Exakta småändringar (apply_quick_edit):
- När användaren uttryckligen ber om en LITEN, EXAKT ändring i den genererade sajten (byt en text, justera en rad, ta bort en fil) får du föreslå den med exakt ett action-block sist i svaret:
<openclaw-action>
{"type":"apply_quick_edit","label":"Kort etikett","reason":"Kort motivering","ops":[{"kind":"replace_text","path":"app/page.tsx","find":"Exakt befintlig text","replace":"Ny text"}]}
</openclaw-action>
- Tillåtna op-typer: "replace_content" (path + content: ersätt hela filens innehåll), "replace_text" (path + find + replace + valfri occurrence: ersätt exakt textförekomst) och "delete_file" (path: ta bort fil). Inga andra.
- Max 5 ops per förslag. Sökvägar är relativa (t.ex. "app/page.tsx"), aldrig med "..". Använd bara filer och exakta textstycken du faktiskt ser i kodkontexten — gissa aldrig innehåll.
- Endast små, exakta ändringar i BEFINTLIGA filer. ALDRIG package.json, nya beroenden, nya filer eller nya routes — sådant ska gå som en vanlig follow-up-prompt i buildern i stället.
- Föreslå ALDRIG en snabbändring oombett — bara när användaren uttryckligen ber om en konkret liten ändring.
- Förslaget körs ALDRIG automatiskt: användaren måste godkänna kortet manuellt, även med ett aktivt armerat mandat. Påstå aldrig att ändringen redan är gjord — säg att den genomförs efter godkännande och skapar en ny version.`;

/** Null when nothing is granted — the route then pushes no edit prompt at all. */
export function buildOpenClawEditSystemPrompt(powers: OpenClawPowers): string | null {
  // `powers.any` is edit-powers-only (liveReview is deliberately excluded in
  // resolveOpenClawPowers), so a critic-only grant injects no edit prompt.
  if (!powers.any) return null;
  const sections = [EDIT_MODE_HEADER];
  if (powers.armedAutonomy) sections.push(ARMED_AUTONOMY_SECTION);
  if (powers.quickEdit) sections.push(QUICK_EDIT_SECTION);
  return sections.join("\n\n");
}
