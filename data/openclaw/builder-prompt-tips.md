# Builder-prompt-tips (för Sajtagenten)

Detta är en kort guide som Sajtagenten kan citera när användaren frågar
"hur ska jag prompta för X?" eller är frustrerad över att en generering
inte gjorde rätt sak. Skriven i andra-person utan att avslöja interna
namn på pipelines, dossier-systemet eller scaffold-matchningen.

## Generella principer

- **Skriv visuellt och funktionellt separat.** Beskriv UTSEENDE först
  ("blå hero med stor rubrik"), sedan FUNKTION ("klick på CTA leder till
  betalning"). Två olika passar gör att AI:n håller fokus per pass.
- **En sak per uppföljning** när du vill vara exakt. Be om "ändra bara
  rubriktexten" hellre än "fixa den lite". Korta uppföljningar ger små,
  förutsägbara ändringar och färre överraskningar.
- **Var konkret med var.** Säg "i hero-sektionen" eller "på Om-sidan",
  inte bara "någonstans". AI:n vet då exakt vilken fil som ska röras.
- **Om en generering kapas mitt i en fil** är prompten för stor. Be om
  en sak åt gången och hänvisa till tidigare resultat snarare än att
  upprepa hela kontexten.
- **Om något inte funkar visuellt**, säg "så här borde det se ut"
  istället för "fixa felet" — AI:n behöver målbild, inte diagnos.

## Specifika ord triggar specifika moduler

Vissa nyckelord aktiverar färdiga byggblock med inbyggd kvalitet
(reduced-motion, SSR-säkerhet, gracefulFallback). Använd dem när det
passar — då slipper AI:n uppfinna lösningen från grunden.

- **"3D" / "WebGL" / "snurrande objekt"** → 3D-canvas-modul aktiveras.
- **"parallax"** + (scroll/scrollar/scrollas) → scroll-parallax-modul.
- **"parallax"** + (mus/musen/muspekare/cursor/hover-tilt) → mouse-parallax-modul.
- **"glas" / "frosted" / "glassmorphism"** → premium-visuella effekter.
- **"karusell" / "slider" / "bildspel"** → carousel-komponent.
- **"data-table" / "tabell" + sortering/filtrering** → data-table-komponent.
- **"kontaktformulär"** → contact-form med email-utskick (kräver konfig
  för att verkligen skicka mail; UI:t funkar utan).
- **"betalning" / "stripe" / "klarna" / "checkout"** → betal-modul.
  Kräver API-nycklar för att ta emot riktiga betalningar.
- **"AI-chatt" / "chatbot"** → AI-chat-modul. Kräver OpenAI-nyckel för
  att svara på riktiga frågor.
- **"kalender" / "boka tid"** → kalender + bokningsformulär.
- **"dark mode" / "mörkt tema"** → tema-växlare.
- **"cmd+k" / "sökpalett"** → kommandopalett.

## Om "Bygg integrationer" säger att nycklar saknas

Knappen kräver nycklar BARA för funktioner som är affärskritiska för
sajten — alltså sånt som inte fungerar alls om nyckeln saknas. Andra
funktioner (formulär som skickar mail, AI-chatt, analytics) kan
konfigureras senare via knappen i respektive komponent och kräver
inte nycklar för att förhandsvisas eller publiceras.

Om du vill testa publicering-flödet utan att fylla i alla riktiga
nycklar finns det en switch i miljövariabel-panelen — "Tillåt
placeholders för tier-3 i F3". På: deployen lyckas men de funktioner
som kräver riktiga nycklar visar en konfigurations-banner istället
för att fungera.

## När resultatet känns "fel"

- Om AI:n misstolkar prompten ("jag ville ändra texten, inte bakgrunden")
  — säg vad som SKULLE ändrats, inte vad som blev. Konkret omformulering
  ger snabb rättning.
- Om en visuell ändring är liten ("byt rubriktext") men AI:n redesignar
  hela sidan — be om en mindre uppföljning med tydligt scope:
  "Ändra ENBART rubriken i hero. Rör inget annat."
- Om en effekt inte syns i previewn (t.ex. parallax) — vänta tills
  versionen är klar och statusen är "klar/promotad", inte "repairing".
  Reload-knappen i förhandsvisningen kan behövas.
