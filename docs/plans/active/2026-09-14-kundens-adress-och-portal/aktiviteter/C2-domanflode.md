# C2 — Koppla egen domän och hantera primäradress

Område: [03](../03-kundportal.md). Efter C1; använd A3:s adresskontrakt.

## Återanvänd

`DomainManager`, `/api/domains/link`, `/api/domains/verify` och
`resolveVercelProjectForChat` finns. De kopplar till kundens eget genererade
projekt. `app_projects.custom_domain` är canonical, inte legacy
`deployments.domain`. Nåbar API-kod bevisar inte ett komplett DNS-flöde.

## Gör

1. Eget flöde **Jag har redan en domän**. Kräv inte availability eller
   köpoffert för en domän som kunden redan äger. Domänköp förblir avstängt.
2. Visa projektspecifika poster från aktuell Vercel-konfiguration och en
   kopieringsknapp per värde. Dagens hårdkodade standardvärden är inte ett
   garanterat facit. Ingen generell zone-editor i MVP.
3. Skilj ägarverifiering, DNS-riktning och fungerande HTTPS. Visa väntande/fel
   och kontrollera igen. Ett tillfälligt API-fel är okänd status, inte bevis
   för att tidigare verifierad domän blivit ogiltig.
4. Stöd normalfallet apex och `www`, med en vald primärhost och redirect från
   den andra först när båda är korrekt kopplade. Andra godtyckliga subdomän-
   upplägg kan vänta. Ändra inte MX, SPF, DKIM, DMARC eller andra tjänsters TXT.
5. Gör adressbyte till ett kontrollerat flöde: koppla/verifiera ny domän,
   uppdatera kunddeploymentens canonical/redirect via A3, kontrollera HTTPS,
   därefter markera bytet färdigt. Samma sak vid bortkoppling tillbaka till
   branded. Vid fel behåll senaste fungerande publicering och visa återförsök.
6. Verifiera ägarskap per projekt för samtliga steg. Reserverade
   plattformsvärdnamn kan inte tas som valfri kunddomän. Visa att ett namnbyte
   på projektet inte ändrar en redan reserverad slug.

## Automatisk DNS

BYOD med smidig automatisk koppling är önskad riktning. Första leveransen ger
bra manuell koppling och lämnar en tydlig plats för Entri eller motsvarande.
Lägg till automatik när fungerande leverantörskonto, registrarstöd och pris
finns. En klientcallback räcker inte som bevis på lyckad DNS; verifiera server-
sidan. Om kopplingen inte stöds eller avbryts ska manuella instruktioner fungera.

## Klart när

En kund kan koppla sin redan ägda domän från portalen och se DNS/HTTPS-status.
Ett verifierat byte och en bortkoppling når rätt primäradress utan redirectloop.
Provkör apex/`www`, kopplingsavbrott och tillfälligt providerfel. Builderns
DomainManager fungerar fortfarande. Ingen domän köps, flyttas eller förnyas här.
