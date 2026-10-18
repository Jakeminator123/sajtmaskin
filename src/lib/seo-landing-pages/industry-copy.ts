import type { SeoIndustrySlug } from "./registry";

export type IndustryFaq = { q: string; a: string };

export type IndustryCopy = {
  slug: SeoIndustrySlug;
  eyebrow: string;
  lead: string;
  ctaLabel: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  previewKicker: string;
  previewCaption: string;
  previewBlocks: readonly { title: string; body: string }[];
  needsHeading: string;
  needsLead: string;
  needs: readonly { title: string; body: string }[];
  sectionsHeading: string;
  sectionsLead: string;
  sections: readonly { title: string; body: string }[];
  localHeading: string;
  localLead: string;
  localTips: readonly { title: string; body: string }[];
  faqs: readonly IndustryFaq[];
};

export const INDUSTRY_COPY = {
  "hemsida-frisor": {
    slug: "hemsida-frisor",
    eyebrow: "Hemsida för frisör",
    lead:
      "En frisörsajt ska göra tre saker på några sekunder: visa att ni är en riktig salong, vad ett besök kostar ungefär, och hur kunden bokar eller ringer. Instagram räcker för inspiration — sidan är till för tider, priser och förtroende.",
    ctaLabel: "Bygg salongssidan",
    secondaryCtaLabel: "Hemsida till företag",
    secondaryCtaHref: "/hemsida-till-foretag",
    previewKicker: "Exempel · frisörsalong · inte en livekund",
    previewCaption:
      "Illustrerad ritning för en salong — inte ett kundcase och inte ett löfte om fler bokningar.",
    previewBlocks: [
      { title: "Hero + boka", body: "Namn, stadsdel och en tydlig boknings- eller ringknapp" },
      { title: "Prislista", body: "Klipp, färg och barn — uppdaterad, inte en PDF från 2019" },
      { title: "Team", body: "Vem som klipper, med foto ni faktiskt får använda" },
    ],
    needsHeading: "Vad en frisörsajt faktiskt behöver",
    needsLead:
      "Kunden googlar ofta när hen redan vill boka. Sidan ska inte berätta er livshistoria först — den ska ta bort tvekan.",
    needs: [
      {
        title: "Bokning eller ett ringbart nummer",
        body: "Länka till det system ni redan använder, eller visa nummer som går att trycka på i telefon. En “kontakta oss”-sida utan tid släpper bort drop-in-kunder.",
      },
      {
        title: "Prislista som går att skumma",
        body: "Klipp, färg, barn och skägg. Skriv “från” om priset varierar. En inaktuell lista är sämre än en kort lista ni håller uppdaterad.",
      },
      {
        title: "Öppettider och drop-in",
        body: "När ni tar drop-in, när det bara är tidbokning, och hur långt i förväg det brukar vara fullt. Det sparar samtal ni ändå inte kan ta.",
      },
      {
        title: "Personal med riktiga namn",
        body: "Kunder bokar ofta en person, inte “salongen”. Foto och en mening om stil räcker. Använd inte stockansikten som “team”.",
      },
      {
        title: "Adress som stämmer med kartan",
        body: "Samma namn, gata och telefon som i Google Företagsprofil. En siffra som skiljer sig gör att folk ringer fel eller går till fel port.",
      },
    ],
    sectionsHeading: "Sektioner som brukar räcka för en salong",
    sectionsLead:
      "Första versionen behöver sällan en blogg. Hellre startsida plus pris och kontakt än fem tomma undersidor.",
    sections: [
      {
        title: "Start / hero",
        body: "Salongens namn, stadsdel och vad ni är kända för — herrklipp, balayage, barn. En primär knapp: Boka tid eller Ring oss.",
      },
      {
        title: "Tjänster",
        body: "Grupera klipp, färg, styling och behandlingar. En mening per tjänst slår en lång manifesto-text om “hårglädje”.",
      },
      {
        title: "Priser",
        body: "Tabell eller tydliga rader. Märk junior/senior om det påverkar pris. Säg till om ni tar kort, swish eller bara bokningssystemets betalning.",
      },
      {
        title: "Team",
        body: "Kort presentation. Länka gärna varje person till henens kalender om systemet tillåter det.",
      },
      {
        title: "Hitta hit",
        body: "Adress, närmaste hållplats, var man parkerar, portkod om det behövs. En karta-länk räcker — ni måste inte bygga en egen karta.",
      },
      {
        title: "Vanliga frågor",
        body: "Avbokning, barn i stolen, släkt på samma tid, presentkort. Svara på det ni redan säger i telefon.",
      },
    ],
    localHeading: "Lokal SEO för frisörer — utan tjugo stadssidor",
    localLead:
      "“Frisör + er stad eller stadsdel” är oftast rätt sök. Tunna sidor för varje förort ni inte har lokal i sänker förtroendet.",
    localTips: [
      {
        title: "Google Företagsprofil först",
        body: "Rätt kategori, öppettider, foton från salongen och samma telefon som på sidan. Be nöjda kunder om recension där — inte om påhittade citat på sajten.",
      },
      {
        title: "En ärlig områdesmening",
        body: "“Vi ligger på Haga Nygata och tar kunder från hela stan” är mer trovärdigt än tio undersidor med samma text och bytt stadsnamn.",
      },
      {
        title: "Titel som en människa skulle söka",
        body: "Salongsnamn plus frisör och stadsdel. Stoppa inte in “bäst, billigast, drop-in, balayage, barn” i samma title.",
      },
      {
        title: "Bilder ni äger",
        body: "Egna klipp, egen lokal. Före/efter bara med kundens samtycke. Stockhår säljer sällan en tid hos er.",
      },
    ],
    faqs: [
      {
        q: "Räcker Instagram i stället för hemsida?",
        a: "För stamkunder ibland. För nya kunder som googlar “frisör nära mig” är en sida med tider, pris och adress mer pålitlig än ett flöde som byts varje vecka. Många klickar vidare från Insta just för att kolla pris och boka.",
      },
      {
        q: "Måste bokningen sitta inbyggd på sidan?",
        a: "Nej. Länka till Bokadirekt, Booksy eller det ni redan betalar för. Det viktiga är att knappen landar i rätt kalender, inte att ni bygger ett nytt system.",
      },
      {
        q: "Ska jag lägga ut alla priser?",
        a: "Ja, åtminstone från-priser för de vanligaste behandlingarna. Dolda priser ger fler samtal — men inte alltid fler bokningar. Skriv att färgpris beror på längd och utgångsläge.",
      },
      {
        q: "Behöver jag en sida per behandling?",
        a: "Bara om ni verkligen har unikt att säga, till exempel en behandling ni är ensamma om i stan. Annars räcker tjänstelistan. Tomma “balayage Göteborg”-sidor hjälper sällan.",
      },
      {
        q: "Kan jag beskriva salongen och få ett första utkast?",
        a: "Ja. I Sajtmaskin skriver ni vad ni gör, var ni ligger och hur kunder bokar. Granska priser, namn och tider i utkastet innan något går live. Första bygget har ett tak på tre sidor.",
      },
    ],
  },
  "hemsida-hantverkare": {
    slug: "hemsida-hantverkare",
    eyebrow: "Hemsida för hantverkare",
    lead:
      "En hantverkarsajt ska filtrera. Besökaren ska förstå vad ni tar er an, var ni kör och hur en offert går till — innan hen ringer om ett jobb ni inte gör. Referensbilder slår mer än en stockbild på en tomte med tumstock.",
    ctaLabel: "Bygg hantverkarsidan",
    secondaryCtaLabel: "Hemsida till företag",
    secondaryCtaHref: "/hemsida-till-foretag",
    previewKicker: "Exempel · snickeri / bygg · inte en livekund",
    previewCaption:
      "Ritning för en bygg- eller snickerifirma — inte ett kundcase och inte ett volymlöfte.",
    previewBlocks: [
      { title: "Hero + offert", body: "Vad ni bygger, var ni tar jobb, ett formulär eller telefon" },
      { title: "Jobb", body: "Tre–sex projekt med kort caption, inte ett bildkaos" },
      { title: "Så funkar det", body: "Platsbesök, offert, tidplan, faktura" },
    ],
    needsHeading: "Vad sidan behöver som offerten inte redan säger",
    needsLead:
      "Många hantverkare lever på rekommendation. Sidan är till för den som inte känner någon som kan gå i god — och för den som jämför två firmor samma kväll.",
    needs: [
      {
        title: "Tjänster i klartext",
        body: "Nybygge, tillbyggnad, kök, altan, ROT-jobb, bara företag? Skriv vad ni inte tar. Det sparar kvällssamtal om takbyte om ni bara gör inredningssnickeri.",
      },
      {
        title: "Upptagningsområde",
        body: "En rad räcker: “Vi tar jobb i Uppsala med omnejd, längre resor efter överenskommelse.” Lova inte hela Sverige om ni inte åker dit.",
      },
      {
        title: "Bevis ni får visa",
        body: "Före/efter, materialval, kort om uppdraget. Fråga kunden innan namn eller adress syns. Inga lånade villabilder från nätet.",
      },
      {
        title: "Hur offerten går till",
        body: "Ringer ni först, kommer ni ut, är platsbesök debiterat? Osäkerhet här är den vanligaste anledningen att folk inte skickar bilder.",
      },
      {
        title: "F-skatt och försäkring",
        body: "En mening att ni är godkända för F-skatt och har ansvarsförsäkring. Ni behöver inte scanna alla papper. Lämna juridiska detaljer till avtal, inte till heron.",
      },
    ],
    sectionsHeading: "En arbetsordning som ser seriös ut",
    sectionsLead:
      "Byggfirman behöver sällan en webbshop. Behöver ni materialkalkylator kommer det senare — först ska någon vilja be om offert.",
    sections: [
      {
        title: "Start",
        body: "En mening om vad ni gör och för vem. Primär CTA: Be om offert eller Ring. Sekundärt: se jobb.",
      },
      {
        title: "Tjänster",
        body: "Tre till sex kort. Undvik “vi gör allt inom bygg”. Specifikt vinner mot brett när kunden redan vet vad som är trasigt.",
      },
      {
        title: "Utvalda jobb",
        body: "Kök, altan, förråd — med ungefärlig omfattning. “Renovering 2024” utan bildtext hjälper ingen.",
      },
      {
        title: "Så går ett uppdrag till",
        body: "Kontakt → platsbesök → offert → tidplan → slutbesiktning. Säg hur lång tid en offert brukar ta, ungefär, utan att lova bindande leverans.",
      },
      {
        title: "Om firman",
        body: "Hur länge, hur många, vem som kommer hem till kunden. En personbakom slår en anonym logotyp.",
      },
      {
        title: "Kontakt",
        body: "Telefon, e-post, organisationsnummer, område. Formulär med få fält: namn, postort, kort om jobbet, bilder om ni vill ha dem.",
      },
    ],
    localHeading: "Lokal SEO för hantverkare",
    localLead:
      "Sökningarna är ofta “snickare + stad” eller “tillbyggnad + kommun”. En ärlig områdessida slår ett nät av tomma tätortssidor.",
    localTips: [
      {
        title: "En områdessida, inte femtio",
        body: "Lista kommuner ni faktiskt kör till. Skapa inte “snickare Knivsta” som kopia av “snickare Sigtuna” om ni inte har något lokalt att säga.",
      },
      {
        title: "Google Företagsprofil med tjänster",
        body: "Rätt primär kategori, foton från arbetsplatser ni får visa, och recensioner från riktiga kunder. Svara på recensionerna.",
      },
      {
        title: "ROT som information, inte som juridik",
        body: "Säg att många privatjobb kan omfattas av ROT och att ni hjälper till med underlaget. Länka till Skatteverket för aktuella regler — skriv inte in belopp ni inte äger.",
      },
      {
        title: "Namn och org.nr synliga",
        body: "Styrelser och villaägare vill veta vem de anlitar. En sida utan avsändare tappar just de jobben ni vill ha.",
      },
    ],
    faqs: [
      {
        q: "Måste jag visa priser per timme?",
        a: "Inte nödvändigtvis. Många hantverkare offertar per jobb. Säg hur ni prissätter — fast offert, löpande, eller mix — så kunden vet vad som händer efter platsbesöket.",
      },
      {
        q: "Kan jag använda kundernas hus i portfolion?",
        a: "Bara med tillåtelse. Undvik synliga adresser och personliga saker i bild. En caption “kök, Uppsala, 2025” räcker ofta.",
      },
      {
        q: "Räcker Facebook-sidan?",
        a: "Den kan ge förfrågningar. En egen sida med tjänster, område och org.nr är lättare att skicka i en upphandling eller till en granne som inte har Facebook.",
      },
      {
        q: "Behöver jag en sida per kommun?",
        a: "Nej, inte som start. En tydlig områdesmening plus Google-profilen är mer ärligt. Extra ortssidor bara om ni har personal eller lager där.",
      },
      {
        q: "Hur börjar jag i Sajtmaskin?",
        a: "Beskriv firman, vilka jobb ni tar och var ni kör. Granska utkastets påståenden om garantier och tider. Extra sidor och integrationer är merarbete — första bygget stannar på tre sidor.",
      },
    ],
  },
  "hemsida-stadfirma": {
    slug: "hemsida-stadfirma",
    eyebrow: "Hemsida för städfirma",
    lead:
      "Städ säljs på pålitlighet, inte på stockfoton av hinkar. Sidan ska säga om ni tar hem, kontor eller båda, vilket område ni täcker, och hur en första tid bokas. Avtalskunder vill se att ni är ett bolag — inte bara ett nummer i en gruppchatt.",
    ctaLabel: "Bygg städfirmans sida",
    secondaryCtaLabel: "Hemsida till företag",
    secondaryCtaHref: "/hemsida-till-foretag",
    previewKicker: "Exempel · städbolag · inte en livekund",
    previewCaption:
      "Illustrerad struktur för hem- och kontorsstäd — inte ett kundcase.",
    previewBlocks: [
      { title: "Tjänster", body: "Hem, kontor, trappstäd, flyttstäd — vad ni faktiskt tar" },
      { title: "Område", body: "Kommuner och ev. milersättning utanför" },
      { title: "Förfrågan", body: "Yta, hur ofta, postnummer" },
    ],
    needsHeading: "Det kunden jämför innan hen ber om en tid",
    needsLead:
      "Hemstäd och kontorsavtal är olika köp. Blanda inte ihop dem i heron om ni egentligen bara gör det ena.",
    needs: [
      {
        title: "Vilken typ av städ",
        body: "Hemstäd, kontor, trapp/fastighet, flyttstäd, byggstäd. Skriv vad som kräver offert och vad som har ungefärlig starttid.",
      },
      {
        title: "Hur ofta och hur länge",
        body: "Veckostäd, varannan vecka, storstäd. Kunden vill veta om ni jobbar i team eller ensamma, och om samma person kommer tillbaka.",
      },
      {
        title: "Försäkring och nyckelhantering",
        body: "En kort, saklig mening. Ni behöver inte publicera hela rutinpärmen, men tystnad kring nycklar skrämmer just de kunder ni vill ha.",
      },
      {
        title: "Område utan att ljuga",
        body: "Lista kommuner. Säg om ni tar jobb utanför mot körersättning. “Hela Storstockholm” utan förbehåll skapar avbokningar.",
      },
      {
        title: "Ett formulär som går att svara på",
        body: "Postnummer, yta ungefär, hem eller kontor, hur ofta. Inte tjugo fält. Telefon som backup.",
      },
    ],
    sectionsHeading: "Sidor som en städfirma brukar behöva",
    sectionsLead:
      "En startsida kan bära både privat och företag om ni märker avsnitten tydligt. Dela upp när texterna börjar krocka.",
    sections: [
      {
        title: "Start",
        body: "Vem ni städar hos och var. En CTA: Begär tid eller offert. Undvik “vi brinner för rena golv” utan innehåll.",
      },
      {
        title: "Hemstäd",
        body: "Vad som ingår i en vanlig tid, vad som är tillägg (ugn, fönster, strykning), och hur av- och ombokning funkar.",
      },
      {
        title: "Kontor och avtal",
        body: "Kvällstid, larm, kontaktperson, faktura. Här vinner saklighet mot säljspråk.",
      },
      {
        title: "Flytt- eller storstäd",
        body: "Checklista för vad kunden ska plocka undan. Det minskar missnöje mer än en extra rubrik om “skinande resultat”.",
      },
      {
        title: "Om bolaget",
        body: "Organisationsnummer, hur länge, ungefär hur många anställda. Språk ni jobbar på om det spelar roll för kunden.",
      },
      {
        title: "Kontakt",
        body: "Samma uppgifter som i mejlunderskriften. En person bakom offerten slår ett generiskt info@",
      },
    ],
    localHeading: "Lokal SEO för städbolag",
    localLead:
      "Sökord som “hemstäd + kommun” och “kontorsstäd + stad” är vanliga. Kopiera inte samma stycke till varje kommundel.",
    localTips: [
      {
        title: "Postnummer i förfrågan, inte i tjugo URL:er",
        body: "Låt kunden skriva var jobbet är. Bygg inte “städ Hässelby”, “städ Vällingby”, “städ Spånga” med identisk text.",
      },
      {
        title: "Recensioner på rätt ställe",
        body: "Google Företagsprofil och ev. Reco. Citera på sajten bara med tillstånd och utan att hitta på efternamn.",
      },
      {
        title: "RUT som hänvisning",
        body: "Säg att privatpersoner ofta kan använda RUT och att ni hjälper till med underlag. Aktuella tak och regler finns hos Skatteverket — inte som hittepå-procent här.",
      },
      {
        title: "Tydlig avsändare",
        body: "Städ är förtroende i någons hem. Org.nr, adress och ett ansikte gör mer än en animerad gnista.",
      },
    ],
    faqs: [
      {
        q: "Ska hemstäd och kontor ligga på samma sajt?",
        a: "Ja i början, med två tydliga block. Dela upp när ni har olika säljare, priser eller villkor som inte får blandas ihop.",
      },
      {
        q: "Behöver kunderna ett inlogg?",
        a: "Sällan för en första sajt. Av- och ombokning kan skötas via mejl, sms eller det schemaverktyg ni redan har. Portal kommer när volymen kräver det.",
      },
      {
        q: "Måste jag publicera timpris?",
        a: "Inte måste. Många vill ändå se ett spann eller “från”-pris för hemstäd. Kontorsavtal är nästan alltid offert. Säg det rakt.",
      },
      {
        q: "Hur hanterar jag nycklar på webben?",
        a: "Beskriv principen kort: märkning, förvaring, vem som har tillgång. Publicera inte rutiner som gör det lättare att lura sig in.",
      },
      {
        q: "Kan jag ta fram ett utkast utan att kunna kod?",
        a: "Ja. Beskriv tjänster, område och hur en förfrågan ska se ut. Rätta namn, kommuner och villkor i preview. Publicering är ett eget steg.",
      },
    ],
  },
  "hemsida-restaurang": {
    slug: "hemsida-restaurang",
    eyebrow: "Hemsida för restaurang",
    lead:
      "Gästen vill veta om ni har öppet, vad ni serverar och om det går att få ett bord. En restaurangsajt som gömmer menyn i en PDF eller glömmer måndagens stängning tappar just de som redan står och tvekar i mobilen.",
    ctaLabel: "Bygg restaurangsidan",
    secondaryCtaLabel: "Så skapar du en hemsida",
    secondaryCtaHref: "/skapa-hemsida",
    previewKicker: "Exempel · krog / café · inte en livekund",
    previewCaption:
      "Struktur för meny och tider — inte en recensionssida och inte ett bokat event.",
    previewBlocks: [
      { title: "Öppettider", body: "Veckans tider, avvikande helg, kök stänger" },
      { title: "Meny", body: "Rätter som text, allergier, dagens om ni har" },
      { title: "Bord", body: "Boka, drop-in eller bara telefon" },
    ],
    needsHeading: "Det gästen öppnar sidan för",
    needsLead:
      "Matbilder är trevliga. Fel öppettider är dyra. Prioritera fakta som ändras, inte stämningen ni redan har på Instagram.",
    needs: [
      {
        title: "Öppettider som någon äger",
        body: "Veckodagar, kökets sista order, avvikande röda dagar. Samma tider som i Google. En person ska ha ansvar att ändra båda.",
      },
      {
        title: "Meny som text, inte bara PDF",
        body: "Telefoner öppnar PDF:er dåligt. Skriv rätter och ungefärliga priser som HTML. PDF kan finnas extra för utskrift.",
      },
      {
        title: "Allergier och specialkost",
        body: "En mening om hur gästen säger till, och vad ni inte kan garantera. Det är mer förtroende än en ikonrad utan förklaring.",
      },
      {
        title: "Bord och väntetid",
        body: "Bokningssystem, mejl, telefon eller “bara drop-in”. Säg om ni tar sällskap över en viss storlek bara via samtal.",
      },
      {
        title: "Hitta hit",
        body: "Adress, entré, parkering, närmstånd. Catering eller takeaway får egna knappar om det är ett riktigt erbjudande.",
      },
    ],
    sectionsHeading: "En krog-sida som går att uppdatera på en tisdag",
    sectionsLead:
      "Bygg så att kocken eller hovmästaren kan be någon ändra tre rätter utan att riva layouten. Annars blir menyn inaktuell.",
    sections: [
      {
        title: "Start",
        body: "Namn, typ av kök, stadsdel, dagens öppettider. Knapp: Se meny och Boka bord.",
      },
      {
        title: "Meny",
        body: "Förrätt, varmt, efterrätt, dryck — eller lunch/middag. Märk säsongsmeny. Dagens rätt kan vara en kort notis ni byter ofta.",
      },
      {
        title: "Boka",
        body: "Länk till TheFork, BokaBord, eget system eller telefon. Lova inte bord ni inte kan hålla i ett automatiskt formulär.",
      },
      {
        title: "Om stället",
        body: "Vem som driver, hur länge, om ni är vinbar, familjekrog eller lunchställe. Håll det kort — maten ska bära.",
      },
      {
        title: "Privat / fest",
        body: "Bara om ni faktiskt tar släppta sällskap. Antal, menypaket, vem man mejlar. Annars skippa sektionen.",
      },
      {
        title: "Kontakt och fakta",
        body: "Telefon, mejl, org.nr om ni tar faktura, allergi-mejl. Länk till Google-kartan.",
      },
    ],
    localHeading: "Lokal SEO för restaurang och café",
    localLead:
      "Kartpaketet i Google avgör ofta mer än er egen sajt. Sidan ska stämma med profilen, inte slåss mot den.",
    localTips: [
      {
        title: "Företagsprofilen är halva jobbet",
        body: "Rätt kökstyp, uteservering, barnvänligt, rullstol. Foton på mat ni serverar nu, inte från förra årets julmeny.",
      },
      {
        title: "Menyn indexeras om den är text",
        body: "Rätter och rätter+stad är long tail. En bild-meny utan text syns inte. Uppdatera när ni slutar sälja en rätt.",
      },
      {
        title: "En adress, ett namn",
        body: "Samma stavning som på skylten och i kassan. “Bistrot” vs “Bistro” splittrar recensioner.",
      },
      {
        title: "Event som försvinner",
        body: "Ta bort passerade livejazz-kvällar. En kalender full av igår ser övergiven ut.",
      },
    ],
    faqs: [
      {
        q: "Behöver vi onlinebeställning från dag ett?",
        a: "Bara om ni redan har köket och logistiken. En länk till Foodora eller er takeaway-kassa räcker. Bygg inte en egen shop innan vardagen funkar.",
      },
      {
        q: "Hur ofta ska menyn uppdateras på webben?",
        a: "Så ofta den ändras i lokalen. Hellre en kort “fråga personalen om dagens” än en felaktig fiskrätt som tagit slut för två månader sedan.",
      },
      {
        q: "Räcker Google och Instagram?",
        a: "Många gäster stannar där. En egen sida behövs när menyn är lång, när ni tar festbokningar, eller när ni vill äga texterna själva om en app ändrar villkor.",
      },
      {
        q: "Ska vi samla recensioner på sajten?",
        a: "Länka till Google eller TripAdvisor. Klipp inte ihop femstjärniga citat ni inte kan stå för. Påhittade recensioner är sämre än inga.",
      },
      {
        q: "Kan AI skriva menyn åt oss?",
        a: "Den kan föreslå struktur. Rätter, priser, allergener och öppettider måste ni rätta. Publicera inte ett utkast med påhittade rätter.",
      },
    ],
  },
  "hemsida-konsult": {
    slug: "hemsida-konsult",
    eyebrow: "Hemsida för konsult",
    lead:
      "En konsultsajt ska göra erbjudandet begripligt för någon som inte redan känner dig. “Jag hjälper företag att växa” är tomt. Vem, vilket läge, vad som händer efter första mötet — det är sidan. LinkedIn kan sköta CV:t; sidan sköter nästa steg.",
    ctaLabel: "Bygg konsultsidan",
    secondaryCtaLabel: "Hemsida till företag",
    secondaryCtaHref: "/hemsida-till-foretag",
    previewKicker: "Exempel · frilans / rådgivning · inte en livekund",
    previewCaption:
      "Ritning för en tydlig erbjudandesida — inte ett påhittat case.",
    previewBlocks: [
      { title: "Erbjudande", body: "För vem, vilket problem, vilket format" },
      { title: "Process", body: "Samtal, scope, arbete, avslut" },
      { title: "Nästa steg", body: "Boka 20 min eller mejla brief" },
    ],
    needsHeading: "Det en köpare skannar på två minuter",
    needsLead:
      "Inköpare och vd:ar jämför er med två andra flikar. De letar efter passform, inte efter er färgpalett.",
    needs: [
      {
        title: "Ett erbjudande som går att upprepa",
        body: "“Interim CFO för bolag med 20–80 anställda” slår “strategisk sparring”. Säg bransch, storlek eller situation.",
      },
      {
        title: "Format och ungefärlig omfattning",
        body: "Timmar, retainer, projekt, styrelse. Ni behöver inte publicera belopp, men dölj inte om ni bara tar kvartalsuppdrag.",
      },
      {
        title: "Process utan jargong",
        body: "Första samtal, offert, start, avstämning. Vem som gör jobbet — du eller ett nätverk.",
      },
      {
        title: "Bevis utan bluff",
        body: "Anonymiserade uppdrag, roller, resultat ni får nämna. Inga påhittade logotyper. “Referens på förfrågan” är okej om det är sant.",
      },
      {
        title: "Ett nästa steg ni svarar på",
        body: "Kalenderlänk, mejl eller formulär med tre fält. Fem CTAs (“boka, chatta, ring, ladda ner, följ”) är samma sak som ingen.",
      },
    ],
    sectionsHeading: "En sajt som liknar ett bra första mejl",
    sectionsLead:
      "Konsulter överbygger gärna. Tre sidor med skärpa slår en kunskapsbank ni inte underhåller.",
    sections: [
      {
        title: "Start",
        body: "En mening om vem du hjälper och med vilket utfall. CTA: Boka intro. Undvik hero med dimma och “lets grow together”.",
      },
      {
        title: "Tjänster",
        body: "Två till fyra erbjudanden. Varje kort: läge, leverans, inte för vem. Länka vidare bara om texterna faktiskt skiljer sig.",
      },
      {
        title: "Så jobbar jag / vi",
        body: "Steg, ungefärliga ledtider, vad kunden behöver ta fram. Det sänker “vad kostar det?”-mejl som egentligen betyder “hur funkar det?”.",
      },
      {
        title: "Urval av uppdrag",
        body: "Problem → insats → utfall. Inga procent ni inte kan försvara. Bransch räcker om kunden är hemlig.",
      },
      {
        title: "Om",
        body: "Bakgrund, var du sitter, språk, om du tar uppdrag on-site. En bild som ser ut som du.",
      },
      {
        title: "Kontakt",
        body: "Mejl, ev. telefon, org.nr. Integritet: säg att briefen inte delas.",
      },
    ],
    localHeading: "SEO för konsulter — nisch före stad",
    localLead:
      "Om du tar uppdrag i hela landet är “organisationsutveckling för tillverkande bolag” starkare än tjugo stadssidor. Lägg till stad när möten faktiskt sker där.",
    localTips: [
      {
        title: "Sökord som en inköpare skriver",
        body: "Roll + situation, inte era interna produktnamn. “Interims-HR” slår ert varumärkesord ingen känner till.",
      },
      {
        title: "LinkedIn och sajt ska säga samma sak",
        body: "Olika rubriker skapar misstanke. Länka åt båda håll. Sajten äger process och offert — LinkedIn äger nätverket.",
      },
      {
        title: "Skriv inte en blogg som plikt",
        body: "Ett bra PM i kvartalet slår tolv tunna “5 tips”. Publicera när du har en åsikt du kan stå för.",
      },
      {
        title: "Schema och titel är tråkiga med flit",
        body: "Namn, roll, nisch. Undvik “#1 trusted partner”. Sidan är skriven för människor som redan är trötta på det.",
      },
    ],
    faqs: [
      {
        q: "Räcker LinkedIn utan hemsida?",
        a: "För vissa nätverksaffärer ja. En sida behövs när någon vidarebefordrar er till en kollega som inte är inloggad, eller när upphandlingen kräver en URL.",
      },
      {
        q: "Måste jag visa priser?",
        a: "Inte belopp om uppdragen varierar. Säg modell (dag, månad, projekt) och vad som påverkar scope. Det är mer vuxet än “hör av er så tar vi det”.",
      },
      {
        q: "Hur gör jag med NDA-case?",
        a: "Beskriv bransch, storlek och problem utan namn. “Referens efter överenskommelse” är bättre än ett hittepå-varumärke.",
      },
      {
        q: "Behöver jag bokningskalender?",
        a: "Bara om du faktiskt håller de luckorna. Ett mejl med tre tider fungerar. Tom kalender ser sämre ut än ingen kalender.",
      },
      {
        q: "Kan jag starta från en beskrivning i Sajtmaskin?",
        a: "Ja. Skriv nisch, format och vad första mötet ska leda till. Granska att utkastet inte hittar på kunder eller resultat. Credits är engångsköp, inte en byråretainer.",
      },
    ],
  },
  "hemsida-fotograf": {
    slug: "hemsida-fotograf",
    eyebrow: "Hemsida för fotograf",
    lead:
      "Portfolion är produkten. Sidan ska låta rätt kund se rätt bilder snabbt och förstå hur man bokar — inte tvinga hen att gissa genrer i ett oändligt rutnät. Instagram är skissbok; sajten är urvalet ni ställer er bakom.",
    ctaLabel: "Bygg fotografsidan",
    secondaryCtaLabel: "Hemsida till företag",
    secondaryCtaHref: "/hemsida-till-foretag",
    previewKicker: "Exempel · foto · inte en livekund",
    previewCaption:
      "Urval och bokning — inte ett komplett arkiv och inte ett stockgalleri.",
    previewBlocks: [
      { title: "Urval", body: "Få serier, stor bild, kort caption" },
      { title: "Genrer", body: "Bröllop, företag, porträtt — bara de ni tar" },
      { title: "Boka", body: "Datum, typ av jobb, plats" },
    ],
    needsHeading: "Vad en fotografsajt ska klara som flödet inte klarar",
    needsLead:
      "Kunden jämför stillhet, skärpa och om ni tar just det här jobbet. En mixad vägg med fest, produkt och nyfött i samma grid gör hen osäker.",
    needs: [
      {
        title: "Urval per genre",
        body: "Separera bröllop, företag, interior, press. Tio starka bilder per genre slår åttio mediokra. Sidan får gärna vara sträng.",
      },
      {
        title: "Teknisk ärlighet",
        body: "Komprimerade men skarpa bilder. Tunga original sänker mobilen. Alt-texter med motivering, inte “IMG_2048”.",
      },
      {
        title: "Vad som ingår",
        body: "Antal timmar, antal bilder, leveranstid, licens för webb eller tryck. Ni behöver inte en prislista om varje jobb är unikt — men säg hur offerten byggs.",
      },
      {
        title: "Rättigheter i klartext",
        body: "Vem som får använda bilderna, hur länge, om ni publicerar i egen portfolio. Det förebygger mejl efteråt.",
      },
      {
        title: "Bokningsväg",
        body: "Datum, plats, typ. Bröllop behöver mer ledtid än ett vd-porträtt. Formuläret kan vara kort om ni sen tar det per mejl.",
      },
    ],
    sectionsHeading: "En struktur som inte slåss med bilderna",
    sectionsLead:
      "Typografi och luft är en del av hantverket. Låt inte en chattbubbla eller en blinkande CTA äta första viken.",
    sections: [
      {
        title: "Start med ett urval",
        body: "En serie eller tre stora stillbilder. En mening om vem du fotograferar. Knapp: Se portfolio och Förfrågan.",
      },
      {
        title: "Portfolio per genre",
        body: "Egna undersidor när genrerna inte tål att blandas. Inga lösenordsskydd i v1 om ni inte måste — de tappar just de som jämför.",
      },
      {
        title: "Tjänster",
        body: "Bröllop, företag, event, family. En kort “det här tar jag inte” sparar de jobb ni ändå skulle tacka nej till.",
      },
      {
        title: "Om fotografen",
        body: "Var du utgår ifrån, om du reser, språk, hur du jobbar på plats. En bild på dig — kunderna köper en person.",
      },
      {
        title: "Vanliga frågor",
        body: "Regn, extra timme, bilder till släkten, hur lång tid retusch tar.",
      },
      {
        title: "Förfrågan",
        body: "Datum, plats, typ, ungefärligt antal personer. Inte “berätta om din vision” som enda fält.",
      },
    ],
    localHeading: "Lokal SEO för fotografer",
    localLead:
      "“Bröllopsfotograf + landskap” och “företagsfotograf + stad” är olika sök. Blanda inte ihop dem i samma title.",
    localTips: [
      {
        title: "Genre + geografi i titeln",
        body: "En sida per genre ni faktiskt säljer. Inte “fotograf Sverige” om ni bara tar jobb i Skåne.",
      },
      {
        title: "Bild-SEO utan keyword-spam",
        body: "Filnamn och alt som beskriver motivet. “Brudpar i Ystad tegelgård” slår “bästa fotograf bäst bröllop”.",
      },
      {
        title: "Google-profil med rätt typ",
        body: "Fotograf / bröllopsfotograf. Område ni utgår ifrån. Länka till rätt portfoliosida, inte bara startsidan.",
      },
      {
        title: "Inga lånade bilder i hero",
        body: "Stock i en fotografs hero är ett varningstecken. Vänta hellre med sidan tills ni har tre jobb ni får visa.",
      },
    ],
    faqs: [
      {
        q: "Räcker Instagram som portfolio?",
        a: "Som skyltfönster ja. Som underlag för ett företagsköp eller ett bröllop vill många klicka till en stilla sida med villkor, namn och hur leveransen funkar.",
      },
      {
        q: "Hur många bilder ska jag lägga upp?",
        a: "Tillräckligt för att visa linje, inte hela arkivet. Tio till trettio per genre är vanligare än hundra. Byta ut svaga bilder slår att bara lägga till.",
      },
      {
        q: "Ska jag ha webbshop för tryck?",
        a: "Bara om ni redan säljer print och kan leverera. En första sajt kan stanna vid förfrågan. Shop är ett eget åtagande.",
      },
      {
        q: "Kan jag lösenordsskydda bröllopsgallerier?",
        a: "Ja, men inte i första utkastet hos de flesta builders. Länka till det galleriverktyg ni redan använder (Pixieset, Pic-Time, eget). Sidan säljer jobbet; galleriet levererar det.",
      },
      {
        q: "Hur tar jag fram ett utkast i Sajtmaskin?",
        a: "Beskriv genrer, var du utgår ifrån och hur en förfrågan ska se ut. Byt ut platshållarbilder mot era egna innan publicering. Sidan är ett urval, inte en dump.",
      },
    ],
  },
  "hemsida-personlig-tranare": {
    slug: "hemsida-personlig-tranare",
    eyebrow: "Hemsida för personlig tränare",
    lead:
      "En PT-sida ska säga var ni tränar, vilka paket som finns och hur en ny klient tar första kontakten. Före/efter-bilder utan sammanhang och löften om kroppsförvandling på två veckor sänker just de klienter som stannar kvar.",
    ctaLabel: "Bygg PT-sidan",
    secondaryCtaLabel: "Hemsida till företag",
    secondaryCtaHref: "/hemsida-till-foretag",
    previewKicker: "Exempel · PT · inte en livekund",
    previewCaption:
      "Paket och bokning — inte ett träningsprogram och inte ett resultatlöfte.",
    previewBlocks: [
      { title: "Paket", body: "Intro, 10-pass, online — det ni faktiskt säljer" },
      { title: "Plats", body: "Gym, utomhus, hemma, distans" },
      { title: "Boka intro", body: "Ett samtal eller ett första pass" },
    ],
    needsHeading: "Det en ny klient vill veta innan hen skriver",
    needsLead:
      "Träning är personligt. Sidan ska sänka tröskeln, inte skrika motivation. Tydlighet slår pepp.",
    needs: [
      {
        title: "Vem du tar emot",
        body: "Nybörjare, återkomst efter skada, styrka, löpning, seniorer. Säg också vem du hänvisar vidare — det är professionalism, inte svaghet.",
      },
      {
        title: "Var passen sker",
        body: "Vilket gym (och om medlemskap krävs), utomhus, hemma hos klient, video. Tider ni faktiskt har, inte “flexibelt dygnet runt”.",
      },
      {
        title: "Paket utan finstilt i heron",
        body: "Introduktion, klippkort, månad. Vad som händer vid sjukdom. Ni behöver inte publicera varje krona om ni offertanpassar — men dölj inte att det kostar.",
      },
      {
        title: "Bakgrund som går att kolla",
        body: "Utbildning, försäkring, ev. licens. Inga påhittade certifikat. En mening om hur länge du har coachat räcker.",
      },
      {
        title: "Hälsopåståenden ni kan stå för",
        body: "Inga sjukdomslöften. Träning är inte vård. Hänvisa till läkare när det behövs, även på webben.",
      },
    ],
    sectionsHeading: "Sektioner som en PT-sajt brukar bära",
    sectionsLead:
      "Ni säljer tid och omdöme. Sidan kan vara kort. En blogg om “fem övningar” är valfri — paketen är det inte.",
    sections: [
      {
        title: "Start",
        body: "Namn, stadsdel eller gym, en mening om träningsstil. CTA: Boka intro. Undvik dimmiga bilder på okända magrutor.",
      },
      {
        title: "Så funkar det",
        body: "Samtal, ev. rörlighetstest, plan, avstämning. Vad klienten gör mellan passen.",
      },
      {
        title: "Paket",
        body: "Tre alternativ räcker. Märk vilket som är tänkt som start. Online bara om du faktiskt coachar på distans.",
      },
      {
        title: "Om tränaren",
        body: "Bakgrund, egen idrott, vem du gillar att jobba med. En bild där man ser ansiktet.",
      },
      {
        title: "FAQ",
        body: "Avbokning, hur länge ett pass är, om nybörjare är välkomna, vad man har på sig.",
      },
      {
        title: "Kontakt",
        body: "Formulär med mål i en mening, ungefärlig erfarenhet, när på dygnet. Telefon om du svarar i telefon.",
      },
    ],
    localHeading: "Lokal SEO för personliga tränare",
    localLead:
      "“Personlig tränare + stad” och gymmets namn är typiska sök. Koppla er till området ni faktiskt tar klienter i.",
    localTips: [
      {
        title: "Gym och stadsdel i texten",
        body: "Säg var ni står. Folk söker både på yrket och på anläggningen. Länka inte till tjugo stadsdelar ni inte åker till.",
      },
      {
        title: "Google-profil som tränare",
        body: "Kategori, tider, om ni tar nya klienter. Recensioner från riktiga personer. Inga köpta omdömen.",
      },
      {
        title: "Inga medicinska sökord ni inte får bära",
        body: "Undvik att ranka på diagnoser. Det är både etiskt och ett förtroendeproblem om ni inte är vårdgivare.",
      },
      {
        title: "Före/efter med samtycke",
        body: "Datumspann, vad som ändrades i vanor, inga påhittade kilo. Utan samtycke — skippa.",
      },
    ],
    faqs: [
      {
        q: "Behöver jag en app till klienterna?",
        a: "Inte för att sidan ska funka. Program kan delas i det ni redan använder. En app är ett eget produktlöfte.",
      },
      {
        q: "Kan jag ta betalt direkt på hemsidan?",
        a: "I Sajtmaskin är betalning och bokning i första utkastet demo tills ni uttryckligen bygger det. Många PT:s tar Swish, gymkort eller faktura utanför sajten i början.",
      },
      {
        q: "Ska jag lova resultat i siffror?",
        a: "Nej. Kroppar och vanor skiljer sig. Berätta arbetssätt och vad ett samarbete innehåller i stället.",
      },
      {
        q: "Räcker gymmets presentation?",
        a: "Den ger drop-in. En egen sida behövs när du säljer paket i ditt namn, tar klienter utanför anläggningen eller vill äga kalendern.",
      },
      {
        q: "Hur beskriver jag verksamheten för ett AI-utkast?",
        a: "Plats, vilka klienter, paket, hur introbokning går till. Rätta tider och påståenden i preview. Inga hittepå-testimonial i publicerad version.",
      },
    ],
  },
  "hemsida-rormokare": {
    slug: "hemsida-rormokare",
    eyebrow: "Hemsida för rörmokare",
    lead:
      "När något läcker letar folk efter telefon och om ni tar jour — inte efter er varumärkeshistoria. En rörmokar- eller elektrikersajt ska vara stor i mobilen, visa område och skilja nöd från planerat jobb. Samma sak gäller el: syns numret inte ovanför vecket är sidan sen.",
    ctaLabel: "Bygg VVS- eller elsidan",
    secondaryCtaLabel: "Hemsida för hantverkare",
    secondaryCtaHref: "/hemsida-hantverkare",
    previewKicker: "Exempel · VVS / el · inte en livekund",
    previewCaption:
      "Jour och område i första viken — inte ett löfte om att ni är framme på tio minuter.",
    previewBlocks: [
      { title: "Ring jour", body: "Stort nummer, när jour gäller" },
      { title: "Tjänster", body: "Stopp, läckage, värme, el — det ni är behöriga för" },
      { title: "Område", body: "Kommuner och ev. utryckningsvillkor" },
    ],
    needsHeading: "Det som måste synas i telefonen",
    needsLead:
      "En del jobb är akuta, andra är offert. Sidan ska inte tvinga nödjobb genom ett långt formulär.",
    needs: [
      {
        title: "Ett nummer som går att trycka på",
        body: "Störst i heron. Skriv om det är jour, växel eller en person. Öppettider för jour — “dygnet runt” bara om det stämmer.",
      },
      {
        title: "Behörighet och försäkring",
        body: "VVS, våtrum, elbehörighet. En mening. Länka till certifikat om ni vill, men låt inte PDF:en vara enda innehållet.",
      },
      {
        title: "Akut versus planerat",
        body: "Två vägar: ring nu, eller be om tid för byte av blandare. Annars fyller jourtelefonen med offertjobb.",
      },
      {
        title: "Område och tilläggszon",
        body: "Vilka kommuner som ingår. Säg om natt eller lång körning påverkar. Inga exakta utryckningstider ni inte kan hålla.",
      },
      {
        title: "Vad ni inte gör",
        body: "Bara nyproduktion? Bara villa? Ingen bergvärme? Skriv det. Fel lead på jourtid är dyrt.",
      },
    ],
    sectionsHeading: "En sajt som funkar med blöta händer",
    sectionsLead:
      "Stora knappar, lite text ovanför. Resten kan ligga längre ner för den som jämför två firmor i lugn och ro.",
    sections: [
      {
        title: "Hero med telefon",
        body: "Namn, stad, jour eller dagtid. Knapp: Ring. Andra knappen: Offert för planerat.",
      },
      {
        title: "Tjänster",
        body: "Stopp i avlopp, läckage, varmvatten, radiatorer; eller el: felanmälan, central, laddbox om ni faktiskt installerar det.",
      },
      {
        title: "Jourvillkor",
        body: "När jour gäller, hur ni prioriterar, att bedömning sker på plats. Inga garantier om “framme på 20 minuter” om trafiken bestämmer.",
      },
      {
        title: "Planerade jobb",
        body: "Badrum, stam, värmepump, solceller — bara det ni gör. Process: besiktning, offert, tid.",
      },
      {
        title: "Om firman",
        body: "Hur länge, ungefär hur många montörer, F-skatt, försäkring. En bild på bilen eller verkstaden slår en stock-skiftnyckel.",
      },
      {
        title: "Kontakt",
        body: "Organisationsnummer, mejl för offert, fakturauppgifter om ni tar företag.",
      },
    ],
    localHeading: "Lokal SEO för VVS och el",
    localLead:
      "Sökningarna är ofta akuta och lokala. Kartan och recensionerna bär tungt. Sidan ska stämma med profilen.",
    localTips: [
      {
        title: "Kategori och serviceområde i Google",
        body: "Rörmokare, elektriker eller båda om ni är det. Serviceområde ni faktiskt åker till. Jour-tider uppdaterade.",
      },
      {
        title: "En kommunlista, inte ett spinnnät",
        body: "“Vi tar Nacka, Värmdö och Tyresö” på en sida slår identiska “rörmokare Gustavsberg”-sidor.",
      },
      {
        title: "Recensioner efter riktiga jobb",
        body: "Be om omdöme när jobbet är klart. Svara sakligt på kritik. Köpta recensioner syns och skadar mer i den här branschen.",
      },
      {
        title: "Inga skräckrubriker",
        body: "“Livsfarlig el i villaområdet” som klickbete är dålig stil och dålig SEO. Beskriv tjänsten, inte katastrofen.",
      },
    ],
    faqs: [
      {
        q: "Ska jour och offert ligga på samma nummer?",
        a: "Bara om samma person svarar. Annars två knappar. Ett formulär för läckande varmvatten är fel verktyg.",
      },
      {
        q: "Räcker Facebook-gruppen i kommunen?",
        a: "Den ger jobb. En sida med org.nr, behörighet och område är det folk skickar till en granne eller en BRF-styrelse.",
      },
      {
        q: "Måste jag ha chatt?",
        a: "Nej. Chatt som ingen bemannar är sämre än inget. Telefon och mejl räcker för de flesta firmor.",
      },
      {
        q: "Kan jag lova fast pris för stopp i avlopp?",
        a: "Bara om ni verkligen har en fast tariff. Annars säg ungefärlig startavgift och att bedömning sker på plats. Hittepå-belopp på landningssidor hjälper ingen.",
      },
      {
        q: "Hur tar jag fram ett utkast?",
        a: "Beskriv jour eller dagtid, kommuner och tjänster. Kontrollera att numret och behörighetsorden stämmer innan publicering. Första versionen behöver sällan mer än startsida, tjänster och kontakt.",
      },
    ],
  },
  "hemsida-fastighetsskotsel": {
    slug: "hemsida-fastighetsskotsel",
    eyebrow: "Hemsida för fastighetsskötsel",
    lead:
      "Styrelser och förvaltare jämför er med två andra pdf:er. Sidan ska visa vilka avtal ni tar, hur jour funkar och att det finns en avsändare med organisationsnummer. Det är närmare en upphandlingssida än en hantverkarsida — även om bilarna liknar varandra.",
    ctaLabel: "Bygg skötselsidan",
    secondaryCtaLabel: "Hemsida för städfirma",
    secondaryCtaHref: "/hemsida-stadfirma",
    previewKicker: "Exempel · skötsel / förvaltning · inte en livekund",
    previewCaption:
      "Avtal och jour för BRF och fastighetsägare — inte en anbudsmall och inte ett vunnet kontrakt.",
    previewBlocks: [
      { title: "Avtal", body: "Skötsel, trädgård, teknisk förvaltning — det ni skriver på" },
      { title: "Jour", body: "Vem som svarar, när, hur felanmälan går" },
      { title: "Förfrågan", body: "Antal lägenheter, ort, nuvarande avtal" },
    ],
    needsHeading: "Det en styrelse faktiskt öppnar fliken för",
    needsLead:
      "De har suttit i tre möten. De vill veta om ni tar just deras storlek, om ni har lokala tekniker och hur felanmälan ser ut en lördag.",
    needs: [
      {
        title: "Vilka uppdrag ni skriver avtal på",
        body: "Löpande skötsel, trädgård, städ i trapphus, teknisk förvaltning, bara jour. Säg minsta bestånd om ni har en. Det filtrerar villor som egentligen söker en hantverkare.",
      },
      {
        title: "Felanmälan och jour",
        body: "Portal, mejl, telefon, vad som är akut. Svarstid som ni kan mäta. “Vi finns alltid” utan schema är ett rött fält i protokollet.",
      },
      {
        title: "Geografi med personal bakom",
        body: "Region, antal tekniker ungefär, om underentreprenörer används. Styrelser frågar det ändå.",
      },
      {
        title: "Referenser som tål ett samtal",
        body: "Typ av fastighet och ort, inte påhittade ordföranden. “Referens lämnas till seriösa förfrågningar” är okej.",
      },
      {
        title: "Upphandlingsyta",
        body: "En mejladress för förfrågningsunderlag, org.nr, ev. kollektivavtal i en mening. Ni behöver inte publicera hela anbudet.",
      },
    ],
    sectionsHeading: "Sidor som tål att skickas i en styrelsemail",
    sectionsLead:
      "Layouten får vara lugn. Punktlistor slår hjältetext. PDF-anbud kan länkas, men sajten ska stå själv.",
    sections: [
      {
        title: "Start",
        body: "Vilka fastigheter, vilken region, avtal eller jour. CTA: Begär genomgång. Inte “vi älskar fastigheter”.",
      },
      {
        title: "Tjänster",
        body: "Skötselplan, utemiljö, drift, felanmälan, vinter. Varje kort: vad som ingår i ett typiskt avtal, vad som är tillägg.",
      },
      {
        title: "Så inleds ett samarbete",
        body: "Nulägesrunda, kalkyl, avtal, uppstart, avstämning med styrelse. Ungefärliga ledtider utan bindande datum.",
      },
      {
        title: "Jour och felanmälan",
        body: "Vem som tar samtalet, hur prio sätts, hur hyresgästen får återkoppling. Det är ofta utslagsgivande.",
      },
      {
        title: "Om bolaget",
        body: "Historik, ägare, ungefärlig storlek, var beredskapen sitter. Certifikat om ni har dem på riktigt.",
      },
      {
        title: "Kontakt för anbud",
        body: "Namngiven säljare eller förvaltare slår info@. Fält: antal lägenheter, kommun, avtalsform.",
      },
    ],
    localHeading: "Regional SEO — inte en sida per trapphus",
    localLead:
      "Köpet är sällan “fastighetsskötsel + gata”. Det är bolagsnamn, “BRF-skötsel + region” och rekommendation. Skriv för det.",
    localTips: [
      {
        title: "Region och fastighetstyp",
        body: "“BRF i Västra Götaland” eller “kommersiella hus i Öresund” är ärligare än femtio kommunkopior.",
      },
      {
        title: "Samma bolagsnamn överallt",
        body: "Allabolag, Google, anbud och sajt. Ett extra handelsnamn ska förklaras, inte bara dyka upp i footern.",
      },
      {
        title: "Inga hyresgäst-recensioner ni inte äger",
        body: "Styrelsen är kunden. Citera ordföranden bara med tillstånd. Hittepå-citat är förödande i den här kretsen.",
      },
      {
        title: "Dokument som faktiskt är era",
        body: "Ladda inte upp någon annans skötselplan som exempel. En kort egen checklista räcker.",
      },
    ],
    faqs: [
      {
        q: "Ska hyresgäster kunna felanmäla på vår sajt?",
        a: "Bara om ni har ett system bakom och avtalet säger det. Annars länka till den portal ni redan använder, eller säg att felanmälan går via styrelse/förvaltare.",
      },
      {
        q: "Behöver vi en kundinloggning?",
        a: "Inte för att ranka eller för att få första mötet. Inlogg är ett produktåtagande. Många bolag kör mejl plus befintligt ärendesystem.",
      },
      {
        q: "Hur skiljer sig det här från en hantverkarsida?",
        a: "Hantverkaren säljer jobb. Ni säljer beredskap och avtal. Ton, bevis och CTA ska spegla det — offert på ett stambyte är en annan sida.",
      },
      {
        q: "Kan vi lista alla BRF:er vi sköter?",
        a: "Bara med deras okej. En siffra (“cirka X föreningar i regionen”) kan räcka om den är sann. En namnlista utan tillstånd är ett förtroendeproblem.",
      },
      {
        q: "Hur tar vi fram ett första utkast?",
        a: "Beskriv avtalstyper, region och hur jour / anbud ska nå er. Granska att utkastet inte hittar på certifikat eller kunder. Tre sidor räcker för v1.",
      },
    ],
  },
  "hemsida-skonhetssalong": {
    slug: "hemsida-skonhetssalong",
    eyebrow: "Hemsida för skönhetssalong",
    lead:
      "Naglar, fransar och hud är tidsbokning plus förtroende för hygien och resultat. Sidan ska visa behandlingar, ungefärliga priser och hur man tar en tid. Den ska inte låtsas vara en frisörsajt med bytt rubrik — kunden jämför er med andra salonger i samma kategori.",
    ctaLabel: "Bygg salongssidan",
    secondaryCtaLabel: "Hemsida för frisör",
    secondaryCtaHref: "/hemsida-frisor",
    previewKicker: "Exempel · naglar / hud · inte en livekund",
    previewCaption:
      "Behandlingar och tider — inte ett behandlingsresultat ni inte kan stå för.",
    previewBlocks: [
      { title: "Behandlingar", body: "Naglar, bryn, hud — det ni faktiskt gör" },
      { title: "Priser", body: "Från-priser och tidsåtgång" },
      { title: "Boka", body: "Länk till kalendern ni redan har" },
    ],
    needsHeading: "Det som skiljer en skönhetssida från ett socialt flöde",
    needsLead:
      "Bilder säljer färg och form. Sidan säljer tid, eftervård och att lokalen finns. Båda behövs, men de gör olika jobb.",
    needs: [
      {
        title: "Behandlingslista med tid",
        body: "Gelé, akryl, fransar, facial. Skriv ungefär hur lång tid det tar. Kunden bokar luckor, inte bara “naglar”.",
      },
      {
        title: "Priser som går att jämföra",
        body: "Från-priser, påbyggnad vs nytt, borttagning. Dolda priser ger DM:s ni ändå svarar på med samma lista.",
      },
      {
        title: "Hygien och eftervård",
        body: "En kort, saklig text. Inga medicinska löften. Länka till eftervård ni faktiskt skickar med kunden.",
      },
      {
        title: "Personal och specialiteter",
        body: "Vem som gör nagelkonst, vem som gör hud. Bokning på person om kalendern stödjer det.",
      },
      {
        title: "Åldersgräns och samtycke",
        body: "Om ni tar minderåriga, med vem i sällskap. Det är bättre på sidan än i en irriterad chatt i kassan.",
      },
    ],
    sectionsHeading: "En salongsstruktur som går att hålla ren",
    sectionsLead:
      "Byt ut behandlingar ni slutat sälja. En meny med utgångna filler-namn (om ni ens får göra dem) är sämre än en kort ärlig lista.",
    sections: [
      {
        title: "Start",
        body: "Salongsnamn, stadsdel, vad ni är mest kända för. Knapp: Boka tid. Andra: Se priser.",
      },
      {
        title: "Behandlingar",
        body: "Gruppera naglar, bryn/frans, hud. En mening om förberedelse (kom utan lack, kom utan makeup).",
      },
      {
        title: "Pris och tid",
        body: "Tabell. Märk när pris beror på längd eller skick. Presentkort som egen rad om ni säljer det.",
      },
      {
        title: "Team",
        body: "Foto, namn, specialitet. Inte stock.",
      },
      {
        title: "Hitta hit och regler",
        body: "Adress, sen avbokning, allergier ni behöver veta om. Lugn ton slår “vi tar 100 % av priset”-skrik.",
      },
      {
        title: "FAQ",
        body: "Graviditet, nagelbitare, första besök, hur lång hållbarhet ni committar till utan att lova evighet.",
      },
    ],
    localHeading: "Lokal SEO för naglar och skönhet",
    localLead:
      "“Nagelbar + stad”, “fransstylist + stadsdel”, “ansiktsbehandling + kommun”. En kategori per sida ni faktiskt erbjuder — inte alla modeord i samma title.",
    localTips: [
      {
        title: "Välj rätt primär kategori i Google",
        body: "Skönhetssalong, nagelstudio eller hudvård. Foton på arbetsplatsen och aktuella arbeten ni får visa.",
      },
      {
        title: "Inte samma copy som frisörsidan",
        body: "Bokning och priser liknar varandra, men sökorden och invändningarna skiljer. Skriv om eftervård och tidsåtgång, inte om klipp.",
      },
      {
        title: "Bilder med samtycke",
        body: "Händer, ögon, hud. Inga ansikten utan okej. Inga lånade “inspiration”-bilder som om de vore era.",
      },
      {
        title: "En stadsdel, inte en region-spam",
        body: "Säg var lokalen ligger. Lista inte tio grannkommuner om kunden ändå måste komma till er stol.",
      },
    ],
    faqs: [
      {
        q: "Räcker Booksy eller Bokadirekt utan hemsida?",
        a: "Kalendern kan räcka för stamkunder. En egen sida behövs när någon googlar salongsnamnet, vill se priser utan app, eller får en länk av en vän som inte har kontot.",
      },
      {
        q: "Ska jag sälja serum och lack i en shop?",
        a: "Bara om ni lagerhåller och kan skicka eller sälja i kassan. En första sajt kan länka “köps i salongen”. Shop är extra arbete.",
      },
      {
        q: "Får jag lova att naglarna håller sex veckor?",
        a: "Lova bara det ni brukar se hos era kunder, med förbehåll för skötsel. Eviga garantier blir recensioner när livet händer.",
      },
      {
        q: "Hur skiljer jag sajten från en frisörsajt?",
        a: "Andra behandlingar, andra tider, andra eftervårdsfrågor, ofta annan primär sökfras. Återanvänd inte klipp-FAQ. Länka gärna mellan salongstyper om ni har båda i samma lokal.",
      },
      {
        q: "Kan jag beskriva salongen och få ett utkast?",
        a: "Ja. Skriv behandlingar, ungefärliga tider och hur bokningen går till. Rätta priser och namn innan publicering. Första bygget täcker några sidor — lägg inte hela butiken i v1.",
      },
    ],
  },
} as const satisfies Record<SeoIndustrySlug, IndustryCopy>;

export function getIndustryCopy(slug: SeoIndustrySlug): IndustryCopy {
  return INDUSTRY_COPY[slug];
}
