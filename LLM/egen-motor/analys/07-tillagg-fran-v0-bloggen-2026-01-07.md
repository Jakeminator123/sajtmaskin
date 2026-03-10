# Kort tillägg från Vercels v0-blogg

> 2026-03-06 — Kompletteringsrapport till befintlig analys i `EGEN_MOTOR/`.
> Fokus: sådant från Vercels blogg som tillför något utöver det som redan står.

---

## Slutsats

Det mesta viktiga från blogginlägget finns redan fångat i dina rapporter:
- dynamisk systemprompt
- LLM Suspense
- autofixers
- prompt-cache-konsistens
- URL-komprimering
- success-rate som huvudmetrik

Det som är värt att lägga till är främst **hur v0 minskar kunskapsfel före modellen**
och **hur de delar upp pålitlighet i tre olika latenslager**.

---

## 1. v0 föredrar riktad docs-injektion framför vanlig web search

Bloggens viktigaste strategiska poäng är inte bara att v0 "injicerar docs",
utan att de gör det för att undvika två specifika problem:

1. Web search kan ge gamla bloggar och utdaterade exempel.
2. En liten modell som sammanfattar sökresultat åt huvudmodellen skapar ett
   "telefonspel" där fakta kan tappas, misstolkas eller hallucinera.

För sajtmaskin betyder det:
- Om du vill hjälpa v0 med ny kunskap bör du helst använda **kuraterade,
  versionsstyrda kunskapspaket** i stället för generell sökning.
- Det är extra relevant för snabbt rörliga områden som `AI SDK`, auth-mönster,
  charts och integrationskod.

---

## 2. Exempelkorpus i filsystem är ett separat lager, inte bara mer prompttext

Bloggen säger att v0 inte bara injicerar docs i prompten, utan också ger modellen
tillgång till **handkuraterade kodexempel i ett read-only filesystem**.

Det här är värt att se som en egen kapabilitet:
- Prompten berättar *vad som gäller*
- Exempelfiler visar *hur det faktiskt ska se ut*

Praktisk lärdom för sajtmaskin:
- Om du bygger mer egen motorlogik bör du ha en liten intern exempelkorpus för
  återkommande mönster:
  - `AI SDK`
  - `shadcn/ui`-kompositioner
  - formulär / validering
  - charts / dashboards
  - auth / databas
- Dessa bör hållas som korta, rena referensimplementationer, inte som långa
  promptblock.

---

## 3. Streaming-lagret bör använda live-kunskap om bibliotek, inte bara regex

Bloggen beskriver att v0 inte bara matchar lucide-fel med heuristik, utan:
- embeddar alla ikonnamn
- läser faktiska exports från `lucide-react` vid runtime
- väljer korrekt export eller närmaste match

Det skärper en viktig designpoäng:
- Ett bra streaming-lager är inte bara text-replacement
- Det är **regelmotor + liten kunskapsindex + runtime-validering**

För sajtmaskin innebär det att en enkel första version kan börja med regex,
men den långsiktigt bättre modellen är:
- läs giltiga exports från installerade paket
- verifiera mot dem under stream eller post-fix
- använd fallback-mappning bara när runtime-data saknas

---

## 4. v0:s pålitlighet är uppdelad i tre latensbudgetar

Bloggen gör implicit en nyttig uppdelning:

1. **Före inference**
   Intent-detektion, docs-injektion, URL-komprimering

2. **Under streaming**
   LLM Suspense, typiskt mycket snabba deterministiska omskrivningar
   (exemplet med ikonfix sker inom cirka 100 ms)

3. **Efter streaming**
   Autofixers som kan göra tyngre kontroll och AST-baserade korrigeringar
   (bloggen anger under cirka 250 ms när de behövs)

För sajtmaskin är detta användbart som arkitekturprincip:
- allt behöver inte lösas i prompten
- allt behöver inte heller lösas i en stor post-process
- varje feltyp bör placeras i billigaste möjliga lager

---

## 5. Rekommenderade tillägg till din roadmap

Om du vill ta med det mest användbara från blogginlägget i sajtmaskins riktning
är detta den korta prioriteringslistan:

1. Bygg en liten **kuraterad exempelkorpus** för de vanligaste mönstren.
2. Separera **docs-injektion** från **exempel-injektion** i din mentala modell.
3. Låt streaming/post-fix läsa **faktiska package-exports** där det går.
4. Mät framgång som **preview/render-success**, inte bara "modell gav svar".

---

## Kort bedömning

Blogginlägget ändrar inte huvudslutsatsen i din befintliga analys.

Det bekräftar snarare att sajtmaskin redan tänker rätt i sin pre-processing,
men att nästa stora kvalitetslyft kommer från:
- bättre kunskapsinjektion
- kuraterade exempel
- smartare post-LLM-lager

Källa: [How we made v0 an effective coding agent](https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent)
