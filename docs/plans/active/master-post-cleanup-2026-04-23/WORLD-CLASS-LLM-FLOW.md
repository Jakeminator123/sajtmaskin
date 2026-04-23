# Världsklassigt LLM-flöde för Sajtmaskin

_Rekommenderad plats i repo:t: `docs/architecture/world-class-llm-flow.md`._

Det här dokumentet beskriver **målbilden**, inte allt som måste byggas om direkt. Tanken är att ge en ren modell för hur Sajtmaskins LLM-kedja bör fungera när den är som bäst.

---

## 1. Designmål

En världsklassig builder ska vara:

- **snabb att förstå** för dig som äger systemet
- **stabil för vanliga användarsajter**
- **bra på delta-förändringar**, inte bara init
- **ärlig i UI och telemetry**
- **sparsam med LLM-repair**
- **bra på rika capabilities** som 3D, integrationer och specialkomponenter

Den ska också skilja tydligt på:

- vad systemet **tror**
- vad systemet **bygger**
- vad systemet **verifierar**
- vad UI:t **vågar lova**

---

## 2. De tre faserna

## Fas 1 — Intent Architecture
Här bestämmer systemet **vad** som ska byggas och på vilken bas.

## Fas 2 — Build Architecture
Här bygger systemet en **kandidatversion** och kör deterministiska pass innan runtime.

## Fas 3 — Runtime Architecture
Här startas previewn, verifiering körs och resultatet klassas som F2 eller F3.

---

## 3. Init-flöde i världsklass

```text
[INIT]
User prompt
  -> junk/ambiguity guard
  -> brief extractor
  -> capability graph
  -> scaffold resolver
  -> scaffold variant resolver
  -> dossier packer
  -> route/build planner
  -> immutable generation contract
  -> primary codegen LLM
  -> deterministic mechanical passes
  -> optional LLM repair gate
  -> preview boot
  -> F2 classification
  -> optional F3 checks
  -> accepted artifact + orchestration snapshot
```

### Vad varje steg ska göra

### junk/ambiguity guard
Stoppar skräp, loggar och oklara klipp från att bränna dyra tokens eller ge absurda defaults.

### brief extractor
Plockar ut användarens egentliga mål, constraints och prioriteringar.

### capability graph
Markerar behov som exempelvis:
- ecommerce
- auth
- content-heavy
- motion
- 3d_scene
- cms-ish
- integrations

### scaffold resolver
Väljer startstruktur.

### scaffold variant resolver
Väljer stil- eller formfaktor inom scaffolden.

### dossier packer
Lägger till specialkunskap eller capability-paket när det behövs.

### route/build planner
Bestämmer sidor, viktiga komponenter, beroenden och outputform.

### immutable generation contract
Det här är den viktigaste saken: när init gått klart ska systemet ha ett **tydligt kontrakt** för vad som ska byggas, inte fortsätta gissa djupt in i kodgenereringen.

---

## 4. Follow-up-flöde i världsklass

```text
[FOLLOW-UP]
User follow-up
  + prior accepted artifact graph
  + prior orchestration contract
  + prior snapshot
  -> follow-up classifier
       cosmetic | structural | technical | capability-add | redesign
  -> delta planner
  -> contract inheritance
       reuse scaffold / variant / quality target by default
  -> capability refresh only if new signal is strong
  -> updated immutable follow-up contract
  -> primary codegen LLM
  -> deterministic mechanical passes
  -> optional LLM repair gate
  -> preview boot
  -> F2 classification
  -> optional F3 checks
  -> new snapshot
```

## Nyckelprincip

**Follow-up är inte ett nytt init.**

Follow-up ska behandlas som en **delta-operation på en accepterad basversion**. Det betyder:

- återanvänd scaffold som default
- återanvänd variant som default
- återanvänd quality target som default
- återanvänd route-graf så långt det går
- gör capability-refresh bara när ny funktionalitet faktiskt efterfrågas
- full reset bara vid tydlig redesign eller uttrycklig omstart

---

## 5. Vad Deep Brief ska vara

Deep Brief ska vara ett **smalt fas-1-lager**, inte en fantasimaskin.

Det får:
- strukturera intent
- fylla små, rimliga defaults
- ge scaffold/variant/capability-hints
- logga sina antaganden

Det får inte:
- skriva om halva briefen i onödan
- duplicera annan orkestreringslogik
- fatta dolda beslut sent i fas 2 eller fas 3

Bra tumregel:

> Deep Brief ska göra färre saker, men göra dem tydligare.

---

## 6. Scaffolds, variants och dossiers i världsklass

## Scaffold
Bestämmer grundstruktur.

## Variant
Bestämmer form, ton eller kompositionsstil inom scaffolden.

## Dossier
Ger specialkunskap eller capability-specifik styrning.

### Viktig regel

Dessa tre får inte glida ihop.

- scaffold är inte variant
- variant är inte dossier
- dossier är inte en osynlig reset av scaffold

### Exempel: 3D-pizza på förstasidan

Rätt beteende på follow-up:

```text
follow-up text
  -> classified as capability-add
  -> capability_refresh: 3d_scene
  -> dossier injection: rich-visual / three-fiber support
  -> dependency planner adds packages
  -> hero/page mount updated
  -> preview smoke checks canvas mount
```

Fel beteende:
- ny scaffold utan anledning
- borttappad basversion
- dold paketinstallation utan logg
- verifiering som säger error fast preview fungerar

---

## 7. Build Architecture i världsklass

Fas 2 ska vara mer compiler-lik och mindre mystisk.

```text
Generation contract
  -> primary LLM
  -> candidate artifact graph
  -> mechanical lane
  -> static gate lane
  -> llm repair lane (only if needed)
  -> runtime candidate
```

## Tre lanes

### A. Mechanical lane
Exempel:
- imports
- assets
- reference rewrites
- små codemods

### B. Static gate lane
Exempel:
- syntax
- schema
- typ av hårda pre-runtime-kontroller

### C. LLM repair lane
Ska bara köras när A och B inte räcker.

### Nyckelregel

Du kan ha många regler internt, men **utåt ska repair-systemet se ut som ett system**, inte som en djungel av 40 små hemliga pass.

---

## 8. Runtime Architecture i världsklass

```text
runtime candidate
  -> transfer
  -> install
  -> start
  -> iframe_live
  -> F2 evaluation
  -> optional F3 evaluation
  -> final classification
```

## Fidelity 2

Sajten bootar, renderar och går att använda visuellt.

## Fidelity 3

Bygger på F2 och adderar hårdare confidence, till exempel:
- build
- integration smoke
- capability-specifika extra tester

### Nyckelregel

**F3 får inte ljuga om F2.**

Om previewn faktiskt fungerar ska UI inte visa terminalt rött fel bara för att en senare, hårdare verifiering är osäker.

---

## 9. En enda runtime-sanning

I världsklassläget ska det finnas **en runtime truth**, exempelvis via en event bus eller motsvarande central statusmodell.

Alla dessa ska vara projektioner av samma källa:
- versionsmodal
- iframe overlay
- loggar
- backend status record

Inte fyra konkurrerande statusskrivare.

---

## 10. Hur verify ska fungera

Verifiering ska vara sannare och mindre destruktiv.

Använd gärna klasser som:
- `blocking`
- `warning`
- `unverifiable`
- `info`

### Princip

- `blocking` stoppar promotion
- `warning` får inte låtsas vara terminalt fel
- `unverifiable` betyder att systemet inte vet tillräckligt, inte att resultatet är dåligt

---

## 11. Hur 3D och rika visuals ska fungera

3D ska inte vara specialmagi. Det ska vara en vanlig capability-path.

```text
3d request
  -> capability classifier marks 3d_scene
  -> dossier/capability pack injected
  -> dependency plan updated
  -> scene component generated
  -> mount plan updated
  -> runtime smoke checks canvas/webgl mount
```

Det gör systemet mer förutsägbart än om 3D bara råkar fungera ibland via en dold promptdetalj.

---

## 12. Anti-patterns att undvika

### 1. Follow-up som nästan init
Det gör systemet dyrt, långsamt och oberäkneligt.

### 2. Repair överallt
Många små fixers och flera LLM-repair-calls gör flödet svårt att resonera om.

### 3. Dold capability-injection
Det ska gå att se när systemet la till 3D-, integrations- eller specialstöd.

### 4. Falskt röda runtime-fel
UI får inte ljuga om vad användaren faktiskt ser.

### 5. För många namn för samma sak
Ett repo blir snabbt mentalt trögt när gamla och nya begrepp lever sida vid sida.

---

## 13. Rekommenderade modulgränser

```text
phase-1/
  brief/
  capability-graph/
  scaffold-selection/
  variant-selection/
  dossier-selection/
  followup-classifier/
  delta-planner/

phase-2/
  codegen/
  fixer-pipeline/
  static-gates/
  repair/

phase-3/
  runtime-status/
  preview/
  verify/
  promotion/
  snapshots/
```

Du måste inte ha exakt dessa mappar, men du vill ha **den här sortens ansvarsfördelning**.

---

## 14. Den korta målbilden

```text
INIT = choose a contract
FOLLOW-UP = modify a contract
F2 = preview truth
F3 = stronger confidence
repair = one system, not many moods
3D = ordinary capability path
status = one source of truth
```

---

## 15. När du vet att du är nära världsklass

Du är nära när följande känns sant:

- du kan förklara init på under en minut
- du kan förklara follow-up som en delta-operation utan att tveka
- du kan peka ut exakt när repair får köras
- versionsmodalen stämmer bättre med vad användaren faktiskt ser
- 3D/rich visuals känns som en capability, inte som ett lotteri
- repo:t har färre hemliga lager och färre gamla namn

---

## 16. Rekommenderad migrationsordning

Om du använder planpaketet i samma zip:

1. plan 02 — runtime truth
2. plan 03 — targeted verifier/follow-up truth
3. plan 04 + 05 — fixer-surface och single entrypoint
4. plan 06 — Deep Brief + delta-semantik
5. plan 07 — 3D capability path
6. plan 08 + 09 — core simplification och legacy pruning
7. plan 11 + 12 — unified repair och PromptKit

Det här ger dig snabbast väg från "stark men övermotoriserad" till "stark och begriplig".
