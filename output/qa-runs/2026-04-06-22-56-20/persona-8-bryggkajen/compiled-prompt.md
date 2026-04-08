## Starter intake
Använd underlaget nedan när du bygger den första versionen.

## Sammanfattad behovsanalys
- Sajttyp: Restaurang
- Erbjudande eller idé: Bryggkajen är ett café i Helsingborg med hembakat fika, lunch och cateringtjänster för events.
- Befintlig hemsida: Vi har bara sociala medier
- Huvudmål: Få fler kunder att boka tid för catering
- Målgrupp: Lokala kunder, kontor som vill beställa lunch
- Måste finnas med: Priser och paket, Kontaktformulär, Bokning online
- Önskad känsla/stil: Varmt och personligt

## Användarens egna formuleringar
1. Bryggkajen är ett café i Helsingborg med hembakat fika, lunch och cateringtjänster för events.

## Sidstruktur
Bygg följande sidor med dessa sektioner:

### Startsida (`app/page.tsx`)
1. Hero med rubrik, underrubrik och primär CTA
2. Meny-höjdpunkter eller populära rätter (3-4 kort)
3. Kort om oss (2-3 meningar + bild eller ikon)
4. Socialt bevis (2-3 kundcitat med namn och roll/företag)
5. CTA-banner (tydlig uppmaning med kontrasterande bakgrund)
6. Kontaktsektion (adress, telefon, e-post, eventuellt karta)

### Om oss (`app/om-oss/page.tsx`)
1. Rubrik och inledning
2. Vår historia / bakgrund
3. Teamet (om relevant) — namn, roll, kort bio
4. Värderingar eller arbetssätt

### Meny (`app/meny/page.tsx`)
1. Menykategorier (förrätter, varmrätter, desserter, drycker)
2. Varje rätt: namn, kort beskrivning, pris
3. Allergeninformation

### Priser (`app/priser/page.tsx`)
1. Prispaket (2-3 nivåer i kolumner)
2. Vad som ingår per paket (checkmarks)
3. CTA under varje paket
4. FAQ om priser

### Boka tid (`app/boka/page.tsx`)
1. Rubrik och kort beskrivning
2. Bokningsformulär (namn, e-post, telefon, datum, tid, meddelande)
3. Bekräftelsemeddelande efter submit

### Kontakt (`app/kontakt/page.tsx`)
1. Kontaktformulär (namn, e-post, telefon, meddelande)
2. Direktkontaktinfo (telefon, e-post, adress)
3. Öppettider
4. Sociala medier-länkar

## Instruktion
- Bygg direkt utifrån underlaget ovan. Följ sidstrukturen exakt.
- Ta trygga designbeslut när detaljer saknas.
- Prioritera tydlig struktur, ett starkt första intryck och en relevant CTA.
- VIKTIGT: Varje sida ska ha MINST 3-4 sektioner med verkligt innehåll.
- Undersidor ska vara innehållsrika — inte bara en rubrik.

## Heading-hierarki och bildhantering
- Exakt EN `<h1>` per sida. Aldrig fler.
- Headings i strikt hierarki: h1 → h2 → h3. Hoppa aldrig över nivåer.
- Alla bilder via `next/image` med `alt`-text på svenska.
- Hero-bilder: `priority` och `fill` eller explicit bredd/höjd.
- Footer: kontaktinfo, öppettider (om relevant), sociala medier-ikoner, copyright-text.

## SEO-metadata
- title: "Bryggkajen — Bryggkajen är ett café i Helsingborg med hembakat fika, lunch och cateringtjänster för events" (anpassa per sida)
- description: 150-160 tecken, på svenska.
- keywords: relevanta svenska sökord som `string[]` — ALDRIG `as const`.
- Open Graph: title och description på svenska.

## Språk och ton (svenska)
All text ska vara på svenska (å, ä, ö). Inga emojis. Inga engelska placeholder.
Skriv riktiga stycken (2-3 meningar). Autentiska svenska namn och adresser.
Navigation: Hem, Om oss, Tjänster, Kontakt, Priser. Knappar: Kom igång, Läs mer, Kontakta oss, Boka tid.
Telefonnummer: 070-123 45 67. Adress: Storgatan 12, 411 38 Göteborg.
Footer-copyright: "© 2025 Företagsnamn" (INTE "All rights reserved").
Metadata-arrayer: ALDRIG `as const` — TypeScript kräver mutable `string[]`.