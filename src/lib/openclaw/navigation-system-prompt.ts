/**
 * Kodnavigering — systeminstruktion för Sajtagenten i en öppen builderchatt.
 *
 * Skickas när requesten bär en ägarverifierad chatt (oavsett befogenheter:
 * läsning är ofarlig och är det som gör agenten användbar). Tillsammans med
 * det alltid närvarande filmanifestet (`chat-context-policy.ts`, `navigate`)
 * ger den agenten ett riktigt arbetssätt: titta i manifestet, be om de filer
 * som behövs, svara med koden framför sig.
 */

import {
  READ_FILES_MAX_PATHS,
  READ_FILES_MAX_ROUNDS,
  READ_FILES_TURN_PREFIX,
} from "./read-files";

export function buildOpenClawNavigationSystemPrompt(): string {
  return `Kodnavigering (read_files) — så läser du sajtens kod:
- Du har alltid ett [FILMANIFEST] för den öppna chatten: filnamn, typ och storlek. Det är sajtens faktiska filer, inte ett förslag.
- När en fråga, granskning eller ändringsbedömning kräver att du ser koden: be om filerna i stället för att gissa. Avsluta svaret med en kort rad ("Jag tittar i app/page.tsx …") och EXAKT ett action-block sist:
<openclaw-action>
{"type":"read_files","paths":["app/page.tsx","components/hero.tsx"],"reason":"Kort motivering"}
</openclaw-action>
- Högst ${READ_FILES_MAX_PATHS} filer per runda och högst ${READ_FILES_MAX_ROUNDS} rundor per användarfråga. Välj de mest relevanta först (sidan som frågan gäller, layouten, komponenten som nämns). Stora filer klipps vid en teckenbudget och markeras då; be om färre filer per runda om du behöver hela innehållet.
- Du får sedan innehållet som ett internt meddelande som börjar med ${READ_FILES_TURN_PREFIX}. Svara då på användarens ursprungliga fråga, citera sökvägar och var konkret. Be inte om samma fil två gånger.
- Använd bara sökvägar som står i manifestet. Hitta aldrig på filer eller innehåll; saknas något, säg det.
- read_files är läsning. Ändringar går fortfarande genom start_build, snabbändring eller ett fältförslag enligt dina befogenheter.`;
}
