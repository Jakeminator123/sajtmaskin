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
- [ ] `SM-074` uppföljning efter deploy: REVIDERAD rotorsak (2026-09-01, chat
      `c2371f9c`) är sessionsrotation — follow-up mot hibernerad VM handoff:ar
      gammal `previewSessionId` medan boot:en får en ny; höjd reload-timeout
      hjälper inte (ingen reload försöks). Klientfix: rotation adopteras via
      `onPreviewSessionRotated` (PR `fix/preview-session-rotation`). Verifiera
      i prod: follow-up efter >10 min idle ska läka utan banner; överväg
      serverhärdning av follow-up-lanen (`reason=runtime_not_running`).

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
