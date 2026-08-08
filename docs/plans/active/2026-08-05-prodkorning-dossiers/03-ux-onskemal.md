---
status: active
owner: unassigned
topic: Ägarens UX-punkter från prod-sessionen 2026-08-05, uttryckta under körning. Detta är den uttryckliga begäran-listan i MVP-frysens mening — men varje punkt kräver fortfarande ägarens go per punkt innan bygge.
created: 2026-08-05
source: Ägarens kommentarer i realtid under observatörssessionen (chatId 3a6c5472). U7 är mätt och verifierad; övriga är formulerade önskemål.
---

# Ägarens UX-punkter, en per rad

MVP-frysen kräver uttrycklig begäran om exakt saken — den här listan **är**
de uttryckta punkterna, samlade så de inte försvinner i chatthistorik. Ingen av
dem är beställd att byggas ännu; prioritera med ägaren.

## U1 — Builder-chattpanelen ska vara en chattruta, inte en helsida

I det fullbredda läget (`lg:flex-col-reverse`-varianten) tog
`#builder-chat-panel` hela synfältet i lodrät led (observerat: 1447×297 px
fullbredd i botten, i annat läge hela höjden). Ägarens ord: "ska bara vara som
en chatbox och inte uppta hela bilden i lodrät vinkel."

## U2 — Spinnern ska på sikt bli en animerad Sajtmaskin-logga

Dagens `lucide-loader-circle` (snurrande SVG) i chattens statuskort ska bytas
mot en animerad logga. Ren polish, uttryckligen "i framtiden".

## U3 — Agentloggen ska visa stegvis progress med animation

Statuskortet under generering känns statiskt. Önskan: visa vad AI:n "tänker på
X… beslutar Y" stegvis, med en snygg animation vid övergångarna. Notera
relaterad substans-bugg: kortet visar i dag konfiguration i stället för utfall
på två rader (`Deep brief: på`, `tsc-skipped`) — fixas det (02 § B5) blir
kortet ärligare även utan animation.

## U4 — Dra-ut-block behöver en riktig placerings-affordance

Vid drag av ett block mot preview-iframen visas bara en kvadratisk musföljare
(capture-aktig). Önskat: en tydlig placeringspunkt i previewen + gärna en
miniatyr av det valda blocket, och att valet går till chatten som strukturerad
insättning. Relaterat: Visual Composer-ytan finns redan ("Släpp nära över-/
underkant för direkt infogning i app/page.tsx") men kommunicerar inte
placering visuellt.

## U5 — Blockgalleriet ser trasigt ut när förhandsbilder saknas

Verifierat upstream: shadcn publicerar inga PNG:er för `signup-*` och
`chart-*` i **någon** stil (`new-york`, `new-york-v4`, `default`, `base` —
alla 404), medan JSON-payloaden finns (200) och blocken fungerar.
`thumbnailUrl()` returnerar ändå en bild-URL för varje block
(`PREVIEW_IMAGE_STYLE = "new-york"`, `src/lib/shadcn/registry-url.ts:49`), så
alla utan bild landar i `RegistryItemThumb`s felläge "hämtningen misslyckades"
— ett felmeddelande för något som aldrig funnits. Komponentens snällare
`previewKind`-ikon finns redan; block utan känd förhandsbild borde gå den
vägen.

## U6 — Sajtagentens bubbla täcker kundens chattknapp i previewen

Mätt i prod: launchern ligger 1696–1876 × 1455–1512, helt inne i previewytan
(384–1900 × 91–1536), 24 px från nedre högra hörnet — exakt där genererade
sajter lägger flytande chattknappar. Ägaren hittade den genererade chatten
först i egen flik. Gäller alla sajter med bottom-right-element. Kandidatfixar:
flytta launchern utanför iframe-ytan, eller auto-minimera när preview är aktiv.

## U7 — Fel ska inte "flyga överallt" i slutskedet

Vid F3-underkännandet exploderade chatten i staplade felkort ("Slutsteg (78) ·
fel", dubbla integration-suggestion-kort, SVAR KRÄVS-ruta). Ägarens ord: "Nu
flyger det errorlogg över allt." Grundorsaken är A2/A4-defekterna — färre
felaktiga pass ger färre kort — men ytan bör ändå samla samma körnings fynd i
ett kort i stället för att stapla.

## U8 — Miniatyrbilder ska visa färdig sajt, inte dev-verktyg

Följd av 02 § B4: projektbilden i "Mina projekt" innehåller Next.js dev-badge
och en oladdad hjältebild. Önskat slutläge: fota när sajten är renderad klart,
utan dev-chrome.
