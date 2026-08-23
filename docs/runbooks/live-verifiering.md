# Live-verifiering i prod

**Ägare av status:** [`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md) —
§ *Behöver repro* (obevisade) och § *Aktiv kö* (redan bekräftade). Den här
filen är bara en **yta-router**: vilken körning kan avgöra vilken rad.
Kopiera inte premisser hit.

**Default-körning:** `/logg-internet` på
[https://sajtmaskin.vercel.app/](https://sajtmaskin.vercel.app/) (Fritext +
~2 uppföljningar). Observatör antecknar i
`.cursor/logg-internet/runs/` och skriver **inte** till Aktiv kö. Bekräftad
defekt lyfts via `/buggrapport`. Avfärdad rad flyttas till § Arkiv.

---

## 1. En Fritext-session kan träffa

En vanlig `/logg-internet`-körning (landing Fritext → builder-skicka →
preview → två uppföljningar). Extra klick i samma chatt är billiga och
listas i kolumnen *Extra*.

| Rad | Vad som avgörs | Extra i samma session |
| --- | --- | --- |
| Block/Marknadsblock live-smoke | Finns «Lägg till» med Block / Bläddra / Beskriv? Speglar `hero1` hämtad källkod, inte AI-gissning? | Öppna «Lägg till» efter preview; infoga `hero1` om ytan finns |
| `SM-025` Product Postcheck på v2+ | Skippas postcheck med browser-closed på follow-up? | Kräver minst en lyckad init + en follow-up; kolla `/logg` |
| Chromium `/tmp` | Bara om capture/thumbnail faktiskt failar | Läs drain/`[capture-browser]` i `/logg` |
| Fast Edit Lane-skevhet | Preview kör stale chunk efter quick edit på Fly? | Gör en **quick edit** (inte bara chatt-uppföljning). Utan mismatch: rör inte lanen |
| `landing-page` `/om` + `/contact` | En one-page-prompt ger ändå separata sidor? | Prompten ska be om **en** sida |
| Socket lost under generation | Vilken endpoint tappar (`/stream`, `/versions`, …)? | Network/HAR under strömmen |
| `THREE.WebGLRenderer: Context Lost` | Landing-scenen svart/frusen med avatar igång? | Titta på `/` **före** Fritext-skicka |
| Transient 502 `/api/openclaw/health` | Engångs-502 eller bestående? | Network på landing; korrelera tid mot Vercel bara vid träff |
| Analytics före cookie-consent | Initieras analytics före consent på den genererade sajten? | Preview-console efter init |
| Media `/api/uploads/media` | Nås fallbacken från preview-VM? | Bara om sajten faktiskt hämtar media där |
| Font mest Inter | Variant→font-parning syns i output? | Glance i preview/filer, inte eval |
| `SM-014` (Aktiv kö) | Halvfärdig iframe innan runtime redo? | Titta när overlayen släpper |
| `SM-032` (Aktiv kö) | Maps-autocomplete blockerad av CSP på `/`? | Landing före builder |
| `SM-035` (Aktiv kö) | Fly `npm install` exit 254 / preview startar inte? | Preview-host-logg via `/logg` |
| `SM-037` (Aktiv kö) | next-themes hydration-mismatch i console? | Preview-iframe console |
| `SM-038` (Aktiv kö) | Parallella rutter för samma syfte (`/blog` + `/artiklar`)? | Prompt med blogg/innehåll |
| `SM-017` (Aktiv kö) | Kvalitetsgrind ser grön ut innan den körts? | Versionspanel efter finalize |
| `SM-031` (Aktiv kö) | Syns chipet «Verify-lane OK» någonsin? | Versionspanel |
| `SM-039` (Aktiv kö) | Diagnostik blandar v1/v2? | Öppna diagnos efter två versioner |
| `SM-056` (skuld) | Modellen emitterar en sida planen saknar? | Titta på filer vs ruttplan efter init |

---

## 2. Samma chatt, men annat läge eller nyckel

Inte default-Fritext. En egen `/logg-internet`-prompt eller manuellt steg.

| Rad | Kräver |
| --- | --- |
| OpenAI-acceptanskedjan | Byggblock → spara riktig projektägd `OPENAI_API_KEY` → «Bygg integrationer» en gång → chatt → reload |
| `SM-030` Mongo i F2 + F3 | Prompt som ber om Mongo + F3-godkännande |
| `SM-033` wizard-timeout | Landing **Analyserad**, inte Fritext |
| `SM-013` «Läser in mallen» | Landing **Template** + misslyckad init |
| Template-gallerikrasch | Click-smoke på synliga mallar |
| Variant-ID överlever clear | Explicit clear/rematch efter variant satt |
| Verify/export F2-kuvert i F3 | En F3-build + verify/export |
| F3-readiness vs `files_json` | Samtidig user-edit/repair under finalize |
| Dubbla approve-svar | Dubbel-submit på F3-approve |
| F3 auto-kick `onF3Ready` | Parallell F2-follow-up + F3-send |
| Integrationsdetektor-miss | Konkret provider + filsnippet |
| `analytics` + dashboard-charts | Prompt som kan dubbelaktivera båda |
| Quick-edit före lease | Samtidig repair + quick-edit |
| Hydration RepairGate-par | Efter drift: samma version med både `preview:client-error` och hydration-advisory |
| Automatisk boot av `starting` | Host-omstart/krasch under boot |
| Inspector crop / inspect-brygga | Inspektören på (flagga); DPI/zoom + ev. CSP `frame-src *.fly.dev` |
| Loopia re-link | Domän med redan skapade DNS-poster |
| `SM-007` / domänköp | Flaggan `SAJTMASKIN_DOMAIN_PURCHASE` är av — kör inte |

---

## 3. Inte browser — script, eval eller annan yta

| Rad | Vad som ska köras |
| --- | --- |
| `(null)`-scaffoldkohort | `node scripts/db/control-stats.mjs --json --env=.env.vercel.production.pulled --days=14 --allow-insecure-ssl` |
| DB-pool-svält | Pool `x/3`, idle, waiting under en prodgenerering |
| `arcade-with-klarna` merge-syntax | `npm run eval -- --prompts=arcade-with-klarna --dump-files` (kostar) |
| Scaffold required files i export | Deterministisk preflight när repro finns |
| Vercel-toolbar a11y `#radix-_r_8_` | Ny a11y-audit + DOM-inspektion (id byter värde) |
| OpenClaw «Skills 53/53» | Gatewayns faktiska `tools` i containern, inte prod-UI |
| T3 fel före första version | Schemaändring + prodvalidering efteråt — inte en session |
| T9b generation dör vid frånkoppling | Ägarbeslut; triggas när en generation dör, inte som jakt |
| T11 loop-säker Log Drain | Ägare närvarande; kör drain-runbooken, skapa inte drain här |

---

## 4. Prompt som maxar träffytan i default-sessionen

Svensk SMB-one-page (träffar `/om`/`/contact`-raden), med blogg *eller*
innehåll bara i **en** uppföljning (träffar `SM-038` utan att förstöra
one-page-premissen på init):

1. **Init:** en sida, konkret verksamhet, bokning/kontakt på samma sida.
2. **Uppföljning 1:** lägg till en synlig sektion (priser/paket) — tvingar
   v2 och därmed `SM-025`.
3. **Uppföljning 2:** antingen quick edit (Fast Edit Lane) **eller** «lägg
   till blogg» (`SM-038`).
4. **Efter preview:** «Lägg till» → Block/`hero1`; versionspanel
   (`SM-017`/`SM-031`); diagnos om den finns (`SM-039`).
5. **Före Fritext:** 10 s på `/` — Maps (`SM-032`) och WebGL-scenen.

Korsref mot `/logg` för samma `chatId` när utfallet hänger på postcheck,
capture, Fly-install eller pool — hämta inte drain en extra gång.
