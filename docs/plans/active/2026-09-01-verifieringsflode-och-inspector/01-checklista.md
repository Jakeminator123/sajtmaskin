# Checklista — få hela kedjan att fungera

Bocka av uppifrån och ned. Ägare = Jakob om inget annat sägs. När allt är
avbockat: flytta mappen till `docs/plans/avklarat/` som en rad i dess README.

## A. Redan klart (2026-09-01, verifierat)

- [x] #1218 mergad — reviewkvitto är advisory i `review-window`; självlåsningen
      borta.
- [x] #1220 mergad — stale `preview_ready_timeout`-banner självläker efter sen
      VM-boot.
- [x] #1221 mergad — postcheck väntar på running preview (≤150 s) och skriver
      synlig skip-orsak (`preview_not_running`, `capture_failed`, …) ända ut i
      Degraderad-tooltippen.
- [x] #1222 mergad — Turbopack NFT-trace:ar inte runtime-paths.
- [x] `/tmp`-trycksvep i `src/lib/capture/browser.ts` (SM-072-lindring).
- [x] Död kartläges-overlay släpper igenom klick + visar banner
      (`PreviewPanelInspectorDev.tsx`).
- [x] Avvisat bridge-`ready` syns som status (`usePreviewInspectBridge.ts`).

## B. Verifiera efter nästa prod-deploy

- [ ] Generera en sajt med 2+ follow-ups i följd (burst). Kör `/logg` och
      kontrollera i Vercel-loggen att `[capture-browser] free space` inte
      längre faller mot < 100 MB, alternativt att trycksvepet loggar
      `pruned N leaked Playwright profile dir(s)` och postchecken överlever.
- [ ] Kontrollera att en frisk sajt får **Verifierad** (inte Degraderad) på
      alla versioner i burst-sessionen. Om Degraderad: läs tooltippen — den
      bär nu maskinläsbar orsak (`product_postcheck_skipped: <reason>`).
- [ ] Aktivera "Inspektera preview" på en färsk sajt: hover-markering ska
      komma inom ~1 s (bridge). Om den amber-bannern "Inspektorn kan inte
      läsa den här previewn" visas är det `SM-073`-hostläget — previewn
      behöver laddas om/startas om; buggen är då fortfarande värd host-fixen.
- [ ] Testa kamera-knappen i Sajtagent-widgeten (live review manuellt) — den
      fastnade i evig spinner 2026-08-31; verifiera om `/tmp`-fixen även
      löste den eller om det är en egen defekt (skapa i så fall ny SM-rad).

## C. Kvarvarande kodarbete (agent-körbart)

- [x] `SM-073` host-sidan: **löst av Fly-deployen v59 2026-09-01** — hosten
      körde kod från 24 aug (före #1201); repo-koden var redan korrekt.
      Injektionen bär nu full identitetsstämpel (verifierat live).
- [x] `SM-072` instrumentering: topplista av `/tmp`-poster loggas under tryck
      (`[capture-browser] tmp top consumers: ...`) — nästa prod-burst namnger
      ätaren. Läs Vercel-loggen efter nästa Degraderad-version.
- [x] `SM-074` klientfix: self-heal återupptar pollen efter reload-timeout
      (max 3 försök) i stället för att dö permanent (`usePreviewIframe.ts`).
- [x] `SM-074` sessionsrotation: klienten adopterar ny `previewSessionId` /
      lifecycle via `onPreviewSessionRotated` — mergad [#1232](https://github.com/Jakeminator123/sajtmaskin/pull/1232).
- [x] `SM-072` burst-härdning: core-dump-prune + exakt 1 postcheck-omkörning
      vid infra-skip + resume-vakt (3→5 min) — mergad
      [#1234](https://github.com/Jakeminator123/sajtmaskin/pull/1234). Samma
      PR skickar `productBlocked`-fynd till en riktad, throttlad LLM-auto-fix.
- [x] Ägarbeslut 2026-09-01: preview-sanningsraden (`previewTruth`,
      "Preview klar med luckor" m.fl.) ska aldrig synas — duplicerar
      versionsbadge + chatt. Borttagen i
      [#1237](https://github.com/Jakeminator123/sajtmaskin/pull/1237)
      (öppen vid sessionens avslut; CI körde om efter lintfix).
- [ ] `SM-074` prod-verifiering efter #1232: follow-up mot hibernerad VM
      (>10 min idle) ska läka utan `preview_ready_timeout`. Serverhärdning
      av follow-up-handoff (`reason=runtime_not_running`) är valfri
      uppföljning, inte blocker för att stänga klientspåret.

## D. Ägarbeslut (bara Jakob)

- [ ] `SM-070`/live review: auto-grant är PÅ i prod men härdningen (retrybar
      Blob-upload, 7d-purge + chat-delete, beständig attempt-budget) är inte
      klar. Besluta: stäng `SAJTMASKIN_LIVE_REVIEW_AUTO_GRANT` tills härdad,
      eller ratificera nuläget i `docs/decisions/README.md`.
- [ ] Fly-maskinklass (befintlig backlogfråga): burst-sessioner pressar även
      preview-hostens CPU; `shared-cpu-8x` är +3 USD/mån för dubbel kvot.

## E. Env-läge (inget att ändra för fixarna)

| Nyckel | Läge i prod | Kommentar |
|---|---|---|
| `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE` | `1` | Behåll — bridge är rätt motor; kartläget är död i serverless. |
| `SAJTMASKIN_LIVE_REVIEW` | `true` | Fungerar (gpt-4o-verdicts i prod-logg). |
| `SAJTMASKIN_LIVE_REVIEW_AUTO_GRANT` | `true` | Se ägarbeslutet i D. |
| `SAJTMASKIN_F2_PRODUCT_POSTCHECK` | på (default) | Behåll. |

Inga nya env-nycklar krävs för de landade fixarna.

## F. Session stängd 2026-09-01 — kvar till nästa pass

Kodspåret i den här chatten är levererat (klient + efterkontroll). Planen
stannar i `active/` tills B (prod-burst) är avbockad. Nästa agent tar en
rad här, inte en ny utredning.

| Vad | Varför | Inte i denna session |
|---|---|---|
| Merga [#1237](https://github.com/Jakeminator123/sajtmaskin/pull/1237) när CI är grön | Sanningsraden borta; kräver separat mergeuppdrag | Inget merge här |
| Kompakt "Reparation"-kort i chatten | Auto-fix-turen från #1234 ser ut som en hel generering | Presentation, inte grind |
| `logPassId` på product-postcheck-loggar | "Observationer utan körpass" döljer vad rundan åtgärdade | Telemetri |
| Skärp `cta_no_handler` | Tidsluckor/hamburgare flaggar trots React-state | Heuristik; falska positiva |
| `sajtmaskin.vercel.app` vs `.se`/`.com` | Samma Vercel-projekt och samma prod-deploy. Skillnad = per-domän session/cache. Hård-reload, inte env. | Inget att ändra |
