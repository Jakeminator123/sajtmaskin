# Avslutning

Stäng pågående arbete — eller ett helt arbetsspår. Review, scoped cleanup, synk, verifiering och leverans.

## Andra agenter och parallellt arbete

- **Respektera** pågående arbete av andra agenter eller människor: rör inte filer eller beslut som tillhör ett annat spår utan att stämma av (eller vänta på merge).
- **Integrera** snarare än att skriva över: om samma yta berörs, läs diff/kontext och bevara meningsfulla tillägg från andra — tvinga inte en "ren" lösning som kastar bort deras arbete.
- **Dokumentera** i slutsvar vad som kom från denna session vs vad som redan fanns eller kompletterades från annat håll, när det är relevant.

### Origin-check innan commit/push (OBLIGATORISK)

Andra agenter eller människor kan ha pushat till `origin/<branch>` medan denna session pågått. **Innan du commitar och pushar:**

1. `git fetch --quiet` (uppdatera remote-refs lokalt; inget mergas)
2. Räkna divergens: `git rev-list --left-right --count HEAD...origin/<branch>` → svar `A B` betyder `A` lokala commits framåt, `B` remote-commits bakom.
   - PowerShell-not: `@{u}` blir mojiberg pga encoding. Använd alltid `origin/<branch>` explicit.
3. Tolka resultatet:
   - **`0 0`** → synkat, gå vidare till commit + push.
   - **`A 0`** (A>0) → bara du har lokala commits, push utan force är säker.
   - **`0 B`** (B>0) → någon annan har pushat. Stoppa, läs `git log --oneline HEAD..origin/<branch>` och rapportera till användaren innan du försöker mergea/rebasa.
   - **`A B`** (båda >0) → divergens. Stoppa och fråga; rebasa/mergea inte tyst.
4. Efter push: kör steg 1+2 igen för att verifiera att din push gick fram (`A B = 0 0`).

### Working-tree-ändringar du inte själv gjort

Om `git status` visar pre-existerande modifieringar som inte hör till din session:

- Commit:a **bara dina egna ändrade filer** med explicit lista (`git add file1 file2 ...`), aldrig `git add -A`.
- Lista i slutsvaret vilka filer du **medvetet inte** rörde och varför ("hörde till tidigare arbetsspår, lämnar för ägaren att paketera").
- Stoppa och fråga användaren om scopet är otydligt.

## Mål

1. **Granska** ändringarna med code-review-ögon: buggrisker, regressionsrisker, överdrivna docs och missad verifiering.
   - **Bug-audit-checklista** (kör i den utsträckning det är relevant för det som rörts):
     - **Död kod** — funktioner/exports utan call-sites: `rg "<funktionsnamn>"` ger bara filen själv? Föreslå borttagning eller wire-up.
     - **Tysta error-paths** — `catch {}` utan logging, `?? null` som maskerar fel, `return []` vid saknad fil/dir för kritiska id.
     - **Telemetri-fält som hardcodas** — sök `<flagga>: false` i `persist*.ts` och fråga om värdet borde komma från caller-kontext.
     - **Filvägs-konventioner** — innan du "låser" en path-prefix (`app/` vs `src/app/`, etc.): grep:a HELA repot för andra prefix; om båda används avsiktligt, dokumentera det istället för att förenkla bort.
     - **Schema-drift** — när du ändrar TS-typer / zod-schemas / DB-schema / JSON Schema: kontrollera de andra tre.
     - **Auth-yta** — om du rört `src/app/api/`: är `getCurrentUser` / `withAuth` / `withRateLimit` aktivt på routen?
     - **Dublett-koll mot backloggen** innan ny buggrad — `Select-String -Path BUG-SWARM-BACKLOG.md -Pattern "<nyckelord>"` (+ grep:a `.cursor/bugs/`). Uppdatera befintlig rad hellre än att lägga en ny. Ingen Linear.
2. **Städa inom berört scope:**
   - Ta bort tydligt död/duplicerad kod eller missvisande text.
   - Rensa halv-ersatta parallellspår: temporära hjälpfunktioner, dubbla beslutsvägar, gammal text som beskriver den ersatta vägen.
   - Rensa inte brett "legacy" utan verifierad ersättning.
3. **Terminologidisciplin:**
   - Kontrollera att inga nya begrepp introducerats utan registrering i `docs/architecture/glossary.md`.
   - Kontrollera glossaryns § Namnskuggor om du använt tvetydiga ord.
   - Om du döpt om eller lagt till termer: uppdatera glossaryn i samma leverans.
4. **Synka docs, schemas och sajtmaskin_backoffice.py (med underliggande skritpt i mappen 'backoffice' och eventuella andra relaterade filer) om runtime-sanningen ändrats:**
   - Berörda filer under `docs/schemas/` och `docs/schemas/strict/`.
   - Berörda arkitekturdocs under `docs/architecture/`.
   - `backoffice/` (kanonisk Streamlit-app) och `sajtmaskin_backoffice.py` när backoffice-området, env-ytor eller drift-/adminflöden påverkats.
   - Håll fast vid repo-termer: `orchestrate`, `LLM-input`, `generate/finalize/validate`, `preview/version materialization`, `verify`.
5. **Om du stänger ett helt arbetsspår:** konsolidera eller rensa tillfälliga kördokument, reviewanteckningar och mellanlager som inte längre behöver ligga aktiva. Ta bort eller slimma hellre än att lämna kvar dubbla docs. Se till att `docs/plans/README.md` visar att spåret är stängt.
6. **Verifiera** med riktade tester/lints/typecheck efter behov.
7. **Commit och push.**

## Obligatorisk rutin

- Börja med att kontrollera `git status`, diff och senaste commit-stil.
- Om du ser oväntade eller andras ändringar: stoppa och fråga användaren innan du fortsätter.
- Leta efter kvarvarande gamla begrepp eller fältnamn om en migration nyss gjorts.
- Om `backoffice/` eller `sajtmaskin_backoffice.py` berörs: synka delad helperlogik i `backoffice/shared.py` så att ytorna inte driver isär.
- Om ny logik ersätter gammal: ersätt eller ta bort gammal docs-text i samma leverans — lämna inte parallella sanningar.
- Om du överväger att radera filer eller mappar:
  - Verifiera att de inte importeras, refereras i script eller docs, eller används som kompatspår.
  - Om det inte är uppenbart säkert: rapportera som "kan städas senare" i stället för att ta bort nu.
- Om en planfil finns i kontexten: använd den som referens men ändra den inte om inte användaren uttryckligen ber om det.

## Commit och push

`/avslutning` behandlas som uttryckligt önskemål om leverans, om inte användaren säger att push ska hoppas över.

- Följ repoets commit-stil.
- Commit:a bara relevanta filer.
- Kör push utan force.

## Slutsvar

Rapportera kort:

- vilka risker du hittade och fixade
- vad du medvetet **inte** tog bort
- vilken verifiering som kördes
- commit-hash och branch efter push
