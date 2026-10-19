---
name: bug-koll
description: Bugg-koll av en eller flera PR:ar i ChatGPT Pro (projektet SaJtMaSkIn) via Cursors browser före merge. Används när agenten ska merga och har en ChatGPT-flik, eller när Jakob ber om bug-koll/bug-score.
---

# Bug-koll i ChatGPT

Oberoende buggrapport från ChatGPT Pro före merge. Mergegrind och mandat ägs
av `.cursor/rules/pr-merge.mdc`; den här skillen ersätter dem inte. Utan
ChatGPT-flik gäller vanlig oberoende granskning.

## 1. Förbered

- Samla per PR: nummer, head-SHA och base-SHA (`gh pr view <n> --json
  number,headRefOid,baseRefOid`).
- Skriv en kort kommentar på varje PR på GitHub om att merge planeras och att
  bug-koll körs.

## 2. Kontrollera fliken

Använd Cursors browser med ChatGPT-projektet SaJtMaSkIn. Läs bara chattnamn
och modelläge med ett riktat DOM-anrop (`Runtime.evaluate`), aldrig hela sidan
eller en full snapshot. Modellen ska stå på `Pro`. Chatten får inte vara den
som skrev ändringen; öppna annars en ny chatt i projektet.

## 3. Skicka en begäran

Ett meddelande för alla PR:ar. Mall:

```text
Bug-koll före merge, repo Jakeminator123/sajtmaskin. Granska diffen head mot base:
- PR #<n> head <sha> base <sha>
- ...
Svara med högst <N> rader, en per PR: `#<n> | bug-score 0–10 | MERGE / FIX FIRST / BLOCK | största fyndet med fil:rad`.
```

Spara exakt din promptrad; svaret läses relativt den.

## 4. Vänta och läs svaret

Vänta på färdigt svar, oftast 3–10 minuter. Polla glest med ett riktat DOM-anrop
som tar sidtexten och returnerar bara delen efter din egen promptrad. Ta inte
en full snapshot.

## 5. Agera

- Redovisa bug-score och verdikt per PR i chatten.
- Småfel: rätta, kör berörda kontroller och pusha. Ny head kräver ny bug-koll.
- Större fel (`BLOCK`, eller `FIX FIRST` som inte rättas): blockerar merge tills
  det rättats eller avfärdats med konkret bevis. Rapportera annars till ansvarig
  agent eller Jakob; PR:en kan förkastas.
- Ny head, eller ny base som ändrar samma filer, kräver ny koll.

## 6. Merga

Först när koll, required checks och mandat finns: lös öppna review-trådar
(rulesetet kräver det) och merga enligt `pr-merge.mdc`, normalt
`gh pr merge --squash --match-head-commit <granskad head>`. Aldrig `--admin`.
