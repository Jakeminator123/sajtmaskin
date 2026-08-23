# Live-verifiering i prod

Status ägs av [`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md). Den här
runbooken anger bara vilken körning som kan avgöra en rad; kopiera inte
premisser eller historik hit.

Default är `/logg-internet` mot
[sajtmaskin.vercel.app](https://sajtmaskin.vercel.app/): Fritext, preview och
cirka två uppföljningar. Spara observationen i `.cursor/logg-internet/runs/`.
En observation flyttas inte direkt till `Aktiv kö`: använd `/buggrapport` när
defekten är reproducerad och kodägaren är känd.

## 1. Default Fritext-session

<!-- prettier-ignore -->
| Signal | Steg | Godkänt utfall |
| --- | --- | --- |
| Block/Marknadsblock | Efter preview: öppna ”Lägg till” och infoga `hero1`. | Block/Bläddra/Beskriv syns och previewn använder hämtad Pro-källa, inte metadata-fallback. |
| `SM-025` Product Postcheck | Skapa v1 och en follow-up v2+. | Postcheck körs utan `browser-closed`/skip; korrelera annars samma `chatId` mot `/logg`. |
| Chromium `/tmp` | Läs capture-logg bara om thumbnail/capture failar. | Free/total MB och profilkataloger visar inte en växande instansläcka. |
| Fast Edit Lane | Gör en riktig quick edit på Fly. | Previewn kör den nya chunken; utan mismatch lämnas lanen orörd. |
| Socket loss | Ha Network/HAR öppet under generationen. | Vid tapp: exakt endpoint och transport kan namnges. |
| OpenClaw health | Kontrollera bara om `/api/openclaw/health` ger 5xx. | Bestående fel skiljs från en engångs-cold-start via samma tidsfönster i runtime-loggen. |
| Analytics/consent | Kontrollera en genererad sajt före och efter consent. | Ingen analytics-init före uttryckligt medgivande. |

En bra defaultprompt är ett konkret svenskt SMB-one-page med bokning eller
kontakt på samma sida. Uppföljning 1 lägger till en synlig pris-/paketsektion;
uppföljning 2 är antingen quick edit eller annan liten innehållsändring.

## 2. Riktad browserkörning

<!-- prettier-ignore -->
| Rad | Kräver |
| --- | --- |
| `SM-071` | Prompt med tydlig app/dashboard-intent så `app-shell` väljs på nuvarande master efter variantändringarna 21–23 aug. Fånga första build-/previewfel och jämför med en webbscaffold i samma miljö. |
| `SM-033` | Landingläget **Analyserad**. Korrelera competitor/enrich mot route, stage, duration och request-id; dagens kod saknar full terminal telemetri. |
| `SM-013` | Landingläget **Template** och ett kontrollerat misslyckat `POST /api/template`. Bekräfta om spinnern saknar felläge/retry. |
| `SM-035` | Nästa Fly-installfel. Kräv manager/mode/duration, OOM-, disk-, machine- och regiondata innan rotorsak påstås. |
| `SM-037` | Patch-lane på, HMR av, skilda SSR-/clientsentinels i v1/v2 samt full-update-kontroll. Bind served och selected version till sessionen. |
| Hydration → RepairGate | Samma version/revision måste ha både `preview:client-error` och hydration-advisory. Annars kopplas inget till repair. |
| OpenAI E2E | Spara riktig projektägd `OPENAI_API_KEY`, bygg integrationen exakt en gång, få riktigt providersvar och reloada buildern. |
| Template-galleri | Kör catalog-/Blob-audit och click-smoke på endast dagens synliga mallar. |
| DB-pool | Fånga pool `x/3`, idle, waiting och server-headroom under samma prodgenerering. |
| `SM-007` | Kör inte: `SAJTMASKIN_DOMAIN_PURCHASE` ska förbli av tills hela releasegrinden är stängd. |

## 3. Script eller operatörsyta

<!-- prettier-ignore -->
| Signal | Körning |
| --- | --- |
| Scaffold-kohort | `node scripts/db/control-stats.mjs --json --env=.env.vercel.production.pulled --days=14 --allow-insecure-ssl`; jämför `auto_matched`, `explicit_off`, `template_import` och `unknown_null` per ready/failed/pending. |
| Eval-syntax | `npm run eval -- --prompts=arcade-with-klarna --dump-files` endast när nycklar, nät och kostnad är godkända. Ett gammalt evalfynd är inte en aktiv buggrad. |
| OpenClaw skills | Inspektera gatewayns faktiska `tools`, inte dashboardens installerat-antal. |
| `T3` före första version | Kräver schemaändring och efterföljande prodvalidering; kan inte avgöras i en browsersession. |
| `T9b` frånkoppling | Samla bevis när en generation faktiskt dör; resume/worker är ett ägarbeslut. |
| `T11` Log Drain | Ägaren kör den separata, loop-säkra drain-runbooken. Skapa aldrig en drain som del av verifieringen. |

## 4. Resultatdisciplin

- Reproducerad defekt: skapa/uppdatera en stabil `SM-###`-rad med kodägare och
  minsta nästa steg.
- Ingen träff: lämna i `Behöver repro` tills evidensen är tillräckligt färsk för
  att avfärda raden; skriv inte ”fixad” efter en enda grön körning.
- Avfärdad eller kodfixad rad: flytta till `Arkiv` med merge-/commitbevis.
- Hämta drain, capture- eller pooldata bara när browserutfallet kräver det.
