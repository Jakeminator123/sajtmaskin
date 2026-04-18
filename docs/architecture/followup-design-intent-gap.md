# Follow-up med design-intent: varför "byt bakgrunden" inte alltid landar

**Skrivet:** 2026-04-18 efter observation att follow-up-prompts som ber om visuell ändring ("animationsaktig bakgrund", "ändra färg", "mörkare tema") ofta inte producerar synliga ändringar i `app/globals.css` trots att verksamheten loggar `~ app/globals.css ~ app/layout.tsx ~ app/page.tsx ~ tsconfig.json` som modifierade filer.

**Status:** Utredning. Fix ej genomförd — riktning behöver godkännas av Jakob innan implementation.

---

## Tre rotorsaker

### 1. Brief-LLM körs aldrig på follow-ups

[`src/lib/builder/server-auto-brief-policy.ts`](../../src/lib/builder/server-auto-brief-policy.ts) rad 22-24 + 26-29:

```ts
if (params.promptType === "followup_general" || params.promptType === "followup_technical") {
  return false;
}
if (
  params.orchestrationReason === "technical_content_preserved" ||
  params.orchestrationReason === "preserve_registry_payload"
) {
  return false;
}
```

**Konsekvens:** Vid follow-up uppdateras inte `brief.siteType`, `brief.toneAndVoice`, `brief.domainProfile`, `brief.uiNotes.components`. Orchestrator + dossier-pick + variant-pick får ENDAST den raw user-prompten + scaffold-context som finns från init.

För en design-intent-prompt som "ändra till animationsaktig bakgrund" betyder det att:
- `domainProfile` är fortfarande "fotografistudio" (init)
- `toneAndVoice` är fortfarande "lugn, ljus, professionell" (init)
- Ingen ny uppdaterad `uiNotes.components` skickas vidare

Bygg-LLM ser bara: "användaren har skrivit *animationsaktig bakgrund*" + befintliga filer.

### 2. `app/globals.css` kan saknas i light-context

[`src/lib/config.ts:347`](../../src/lib/config.ts) defaultar `FEATURES.useFollowUpLightContext = true`. Light-context-flödet i [`chat-message-stream-post.ts:382-393`](../../src/lib/api/engine/chats/chat-message-stream-post.ts) inkluderar bara 4-6 filer med fullt innehåll (`FOLLOW_UP_TUNING.lightContextMaxFilesManyFiles` / `lightContextMaxFilesFewFiles` — env-overridable). Resten visas som file-listing utan kod.

Pickaren är inte design-medveten — den prioriterar inte `app/globals.css` när prompten rör bakgrund/färg/tema. Om sajten har 30+ filer och `globals.css` inte är topp-N i relevans-rankningen får bygg-LLM:n bara filnamnet, inte dess befintliga gradient-/oklch-värden.

**Resultat:** LLM:n vet att `app/globals.css` finns men inte vad som är där. Den producerar ofta en patch som "lägger till" en bakgrund överst eller modifierar `app/page.tsx` istället för att rebuild:a `globals.css` ordentligt — vilket inte ger den dramatiska ändringen användaren efterfrågar.

### 3. `clear-redesign`-intent triggas inte på milda design-prompts

I [`chat-message-stream-post.ts:411-426`](../../src/lib/api/engine/chats/chat-message-stream-post.ts) finns en aggressiv prompt-instruktion när `followUpIntent === "clear-redesign"`:

> *"Replace the visual identity, background treatment, layout rhythm... Rewrite the main experience aggressively enough that the result feels new. You may replace globals.css, app/page.tsx..."*

Denna instruktion skulle ge precis det användaren efterfrågar. **Men intent-classifiern triggar bara på explicita keywords** (sannolikt "redesign", "gör om", "helt nytt"). En mild "byt bakgrunden till något coolare" landar i den vanliga `editing-mode`-grenen som säger:

> *"Apply the user's requested changes directly to the current files below. Make visible changes in the dominant UI files when the request affects design, layout, color, animation, or interaction."*

Den är mer konservativ → bygg-LLM:n vågar inte rebuild:a `globals.css` från scratch.

---

## Föreslagna fixar (i prio-ordning)

### A) Force-inkludera `app/globals.css` i light-context när design-intent detekteras (LITEN, ~15 min)

I `buildFileContext`-anropet på rad 386-393, lägg till en `pinnedFiles: string[]`-option som alltid inkluderar specifika filer med fullt innehåll, oavsett relevans-ranking. För follow-ups med design-keywords ("bakgrund", "färg", "tema", "animation", "ljus", "mörk", etc.) pinna `app/globals.css` + `app/layout.tsx`.

Risk: Liten — `app/globals.css` är typiskt under 200 rader, ryms i budget.

### B) Bredda `clear-redesign`-intent-detektion (LITEN, ~10 min)

Hitta intent-classifier-koden (sannolikt `deriveFollowUpContextPolicy` eller `classifyFollowUpIntent`). Lägg till svenska keywords som triggar `clear-redesign`: "byt", "ändra", "annan", "ny stil", "ny look", "coolare", "snyggare".

Risk: Medel — kan över-trigga clear-redesign på små tweaks. Behöver testning.

### C) Mini-brief på design-intent-follow-ups (MEDEL, ~45 min)

Tillåt `shouldRunServerAutoBrief` att returnera `true` även för `followup_*` när prompten har design-intent-signals. Brief-LLM:n får då generera en partial brief med uppdaterad `toneAndVoice` och `mustHave` baserat på den nya prompten + befintlig brief-state.

Risk: Större — kräver att brief-schemat stöder partial mode + att orchestrator vet hur partial brief mergas in i state.

### D) Hard-cap på antal filer som behåller status quo (STOR, ~2h)

Om bygg-LLM:n returnerar 0 ändringar i `app/globals.css` på en design-intent-prompt, automatiskt re-prompta med en starkare instruktion ("Du HAR inte ändrat globals.css. Användaren bad om bakgrund-byte. Skriv om hela `body`-blocket från scratch."). Detta är en klassisk LLM "stuck on previous"-situation som löses med explicit re-direction.

Risk: Större — kräver post-generation diff-analys + automatisk retry-loop.

---

## Rekommendation

Börja med **A + B** som ger mätbar förbättring för en bråkdel av tiden. Verifiera med 3-4 manuella follow-up-tester på Mannes-fotografier-style sajter ("byt till mörkt tema", "lägg till animation i bakgrunden"). Om det fortfarande inte räcker, gå vidare till C.

D är ren defensive-tactic och bör vänta tills A-C är på plats.

---

## Hur man verifierar att en follow-up faktiskt har "fungerat"

I den genererade sajtens `app/globals.css` ska följande synas efter en bakgrund-relaterad follow-up:

- `body { background: ... }` har **byts ut**, inte bara fått tillägg ovanpå
- Eller `--color-background` / `--color-primary` har nya oklch-värden
- Eller en helt ny `@keyframes`-deklaration finns för bakgrundsanimation

Loggen säger `~ app/globals.css` (modifierad) men diff:en kan vara så marginell som ett bytt kommatecken. Bättre signal: jämför filstorlek före/efter eller diff lines.
