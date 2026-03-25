# Parallell granskning — orchestrator-remediation (worktree `xvx`)

**Commit:** `ceaee87b` — `feat(landing): remediation ~18pct — mousemove perf, stack/footer/video`  
**Granskad kodbas:** `C:\Users\jakem\.cursor\worktrees\sajtmaskin__Workspace_\xvx`  
**Planunderlag:** `.j_to_agent/1.txt`, `2.txt`, `3.txt` (huvudrepo)

---

## 1. Stämmer första pushen med en "procent" som motsvarar utfört arbete?

**Ja, rimligt och konsekvent.**

- Commit-raden säger uttryckligen **`~18pct`**, vilket ligger inom din bucket **~15–20 %** för det som var tänkt som första landningsslask.
- `docs/plans/active/external-review-remediation-progress.md` sätter **helhetsvisionen** till **~18 %** och bryter ned att **landing-slice (steg 1–4 i 1.txt) bara är delvis** (~45 % av *den* delen). Det är en tydligare bild än att blanda ihop "18 % av allt" med "18 % av landing" — bra för uppföljning.
- **Faktisk diff** är begränsad till `chat-area.tsx` + progress-dokumentet; ingen touch på integrationsregister, deploy, own-engine eller scripts. Det stämmer med att **~82 %** av helheten enligt planen fortfarande är kvar.

**Kort sagt:** procenten i commiten är inte dekor — den speglar en liten men konkret kodlandning, inte hela 1.txt.

---

## 2. Fas 1 (gjord) — koppling till 1.txt och bedömning

### 2.1 Vad som faktiskt levererats (jämfört med din checklista)

| Mål (din lista) | Status i `ceaee87b` |
|-----------------|---------------------|
| Tilt/glow/terminal utan `setState` på musrörelse | **Gjort** — `use3DTilt` skriver `transform` på DOM-noden; tech/integration-kort och terminal sätter `--glow-x`/`--y` via `setProperty`. |
| `prefers-reduced-motion` för tilt | **Gjort** — `matchMedia("(prefers-reduced-motion: reduce)")` styr ref; tilt-uppdateringar hoppas över. |
| Tech stack närmare `package.json` | **Gjort och verifierbart** — `package.json` har `drizzle-orm`, `@vercel/analytics`, `@vercel/speed-insights`; copy bytt från Prisma/Sentry till Drizzle + Vercel Analytics; integrationsraden har OpenAI istället för Sentry. |
| Footer med riktiga mål | **Delvis** — `/privacy`, `/terms`, `/faq`, `mailto:`; inga falska `href="#"`. Men "Om oss"/"Blogg" → `/faq` är medveten placeholder (dokumenterad i progress). |
| Videoknapp med handling + toast | **Gjort** — `pickCategory("analyserad")` + `toast.message`; `id: "analyserad"` finns i `categories`. |
| En Zod-bullet rättad | **Gjort** — Drizzle → server actions/API i feature-copy. |

### 2.2 Starkt

- **Rätt lager för prestanda:** att flytta bort React-state från mousemove för tilt och glow är exakt det externa granskaren föreslog; det minskar oplanerade re-renders på en tung landningssida.
- **Reduced motion där det gör mest nytta för 3D-känsla:** tilt är ofta det som känns "billigt" eller illamående-genererande; att stänga det där är en bra första åtgärd.
- **Copy drift reducerad** utan att överlöfta nya beroenden: listan närmar sig faktiska deps.
- **Footer:** juridiska länkar pekar på riktiga routes (`privacy`, `terms`, `faq` finns under `src/app/...`).
- **Spårbarhet:** progress-filen kopplar tydligt till källplanerna (1/2/3) och listar osäkerheter — bra för nästa agent eller människa.

### 2.3 Svagheter, risker och potentiella buggar

1. **Reduced motion är inkonsekvent**  
   Tilt respekterar `prefers-reduced-motion`, men **hover-glow** (CSS-variabler) och **`IntegrationCard` float-animation** kör vidare. Progress-filen nämner detta; det är inte en regression så mycket som **ofullständig** tillämpning av steg 4 i 1.txt. Risk: användare som begär reduced motion får fortfarande mycket rörelse.

2. **Juridisk granularitet i footern**  
   GDPR och Cookies länkar båda till **`/privacy`**. Om ni vill vara strikta kan det behövas sida eller ankare för cookie-policy. Produktmässigt OK som tillfällig lösning; juridiskt bör någon bekräfta.

3. **Placeholder-UX för "Företag"**  
   "Om oss" / "Blogg" → `/faq` är ärligt i progress-dokumentet men kan fortfarande upplevas som **missvisande etiketter** (inte trasigt, men svag informationsarkitektur tills riktiga sidor finns).

4. **Imperativ stil + React `style`**  
   Blandning av inline `style` för delays/shadow och direkt DOM-uppdatering är **medvetet** här och ser korrekt ut för dessa kort. Långsiktigt: om någon lägger tillbaka `transform` via React på samma nod kan det **kollidera** med tilt — värt att hålla konventionen tydlig i kodreview.

5. **`use3DTilt` och `useLayoutEffect`**  
   Sätter neutral transform vid mount. I `"use client"`-fil är det OK. Teoretisk **en frame** av "fel" transform innan layout effect är sällan märkbar; ingen blocker hittad.

6. **Headline tilt**  
   Får reduced-motion-skydd via samma hook; **saknar fortfarande** "in view only"-begränsning som planen nämner för 3D överallt — återstår till senare steg.

### 2.4 Sammanfattande omdöme om fas 1

**Positivt:** Första steget är **fokuserat, mätbar och i linje med den yttre granskningens högsta ROI-punkt** (mousemove → ingen onödig React-state). Ingen uppenbar logikbugg i videoknappen eller kategorivalet.

**Att följa upp:** reduced motion för **alla** rörelseelement som fortfarande kör, samt semantisk bakgrund / uppdelning av `chat-area.tsx` enligt steg 1–3 i 1.txt.

---

## 3. Övriga faser — parallell "sentry"-lista (innan nästa push)

Detta är **inte** implementerat i `ceaee87b`; här är vad som bör granskas när orchestratorn tar steg 2–5, så inget glipper.

### 3.1 Landing / produkt-UX (1.txt steg 1–4, kvar ~55 % av landing-slice)

- **Stor uppdelning av `chat-area.tsx`:** risk att props-drill blir fel; säkerställ att **en** hook (`useLandingController`) äger state och att bakgrund/hero är testbara.
- **`LandingBackground` per läge:** undvik fyra överlappande lager utan att minska läsbarhet; kontrollera **kontrast** och **LCP** när grid/noise tas bort.
- **Färre samtidiga effekter:** efter refaktor, profiler igen (låg-end mobil).
- **3D endast in view:** verifiera att **alla** R3F/dynamic-scener respekterar `useInView` eller motsvarande (HowItWorks, eventuella fler).

### 3.2 Integrationer + deploy (1.txt steg 5–7)

- **Ett register:** single source of truth; grep efter duplicerade env-listor efter migrering.
- **Manifest från generator:** fallback till regex måste vara **explicit** och loggad så drift syns.
- **Tunnare deploy:** risk att "auto-fix" flyttas uppströms utan att **preview === prod** — behöver gyllene scenario eller checklista.

### 3.3 Own-engine (2.txt)

- **OwnEngineBuildSession / transaktionell finalize:** klassiska fallgropar — **orphan assistant messages**, dubbel `done`, fel i SSE-ordning.
- **Golden SSE-tester:** se till att de körs i CI utan extern API.
- **Legacy v0-path:** isolerad adapter ska inte läcka in i own-engine state machine.

### 3.4 Repo-hygien / process (3.txt)

- Scripts-städ: innan radering, **sök referenser** i README och orchestrator-dokument.
- **Namngivning** scaffold/dossier/artifact: om ni byter termer, uppdatera **terminology.mdc** / agent-prompter så parallella agenter inte talar förbi varandra.

---

## 4. Rekommenderad nästa kontroll i worktree (när steg 2 landar)

1. `git diff main...HEAD` eller motsvarande mot basgren — begränsa till `src/components/landing-v2/`.  
2. Kör `pnpm lint` / `pnpm test` om orchestratorn rört routes eller hooks.  
3. Manuell smoke: landning med **OS reduced motion på**, mobil viewport, och klick på videoknapp → rätt kategori + toast.

---

*Rapport av parallell granskning; filnamn `18pct-k.md` följer commit-procent `~18pct` + unik bokstav.*
