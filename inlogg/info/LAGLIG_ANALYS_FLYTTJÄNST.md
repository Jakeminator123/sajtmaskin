# Laglig analys: "Flytta smartare"-tjänst

## Tjänstens tänkta flöde

```
+---------------------------+
|   DIN WEBBSIDA            |
|   (flytta-smartare.se)    |
|                           |
|  Användaren fyller i:     |
|  - Ny adress              |
|  - Inflyttningsdatum      |
|  - Medflyttande           |
|  - Ev. c/o, postnr etc.   |
+---------------------------+
           |
           | Klickar "Skicka flyttanmälan"
           v
+---------------------------+
|   TERMS & CONDITIONS      |
|   Explicit samtycke:      |
|   "Vi fyller i dina       |
|    uppgifter hos SKV      |
|    via automatisering.    |
|    Du signerar själv."    |
|                           |
|   [x] Jag godkänner      |
+---------------------------+
           |
           v
+---------------------------+
|   BANKID QR-KOD           |
|   (Playwright-fönster)    |
|                           |
|   Användaren scannar      |
|   med sin BankID-app      |
|   --> Loggar in på SKV    |
+---------------------------+
           |
           | Inloggad
           v
+---------------------------+
|   BACKEND (Playwright)    |
|                           |
|   Fyller i fälten:        |
|   - Ny adress             |
|   - Datum                 |
|   - Medflyttande          |
|   (Data från steg 1)      |
+---------------------------+
           |
           v
+---------------------------+
|   SIGNERING               |
|   Användaren signerar     |
|   med BankID (på SKV:s    |
|   sida eller i Playwright)|
+---------------------------+
           |
           v
+---------------------------+
|   KLART                   |
|   Flyttanmälan inskickad  |
+---------------------------+
```

---

## Vad som ar LAGLIGT

### 1. Samla in uppgifter pa din egen sida
- Helt lagligt. Du ar personuppgiftsansvarig for din egen sida.
- Krav: rattslig grund (samtycke eller avtal), integritetspolicy, GDPR-compliance.

### 2. Visa BankID QR-kod for anvandaren
- Lagligt SA LANGE anvandaren sjalv scannar och signerar.
- Du far INTE logga in AT anvandaren (det vore dataintrang).
- Anvandaren maste sjalv initiera inloggningen med sin egen e-legitimation.

### 3. Hjalpa anvandaren fylla i formularet
- Juridiskt sett: det finns redan tjanster som gor liknande saker:
  - **eDeklarera.se** -- hjalper fylla i och skicka deklarationer
  - **Redovisningsbyraer** -- anvander Skatteverkets deklarationsombud-system
  - **Skatteverkets egna ombud-system** -- privatpersoner kan utse ombud

### 4. Lat anvandaren signera sjalv
- Lagligt och nodvandigt. Signeringen maste goras av anvandaren personligen.

---

## Vad som ar OLAGLIGT eller HOG RISK

### 1. Logga in AT anvandaren (OLAGLIGT)
- **Brottsbalken 4 kap 9c** -- dataintrang: "olovligen bereder sig tillgang"
- Aven med samtycke fran anvandaren kan det vara problematiskt
  om det bryter mot BankID:s eller Skatteverkets villkor.
- Straff: boter eller fangelse upp till 2 ar (grovt: 6 manader - 6 ar).

### 2. Lagra BankID-tokens, personnummer, namn i klartext (GDPR-BROTT)
- **GDPR art. 5** -- uppgiftsminimering: logga inte mer an nodvandigt.
- **GDPR art. 6** -- rattslig grund kravs for varje datatyp.
- **IMY** sager: loggning av personuppgifter krav er styrdokument,
  retention-policy, atkomstkontroll och gallring.
- I nuvarande skv3.py loggas: fullstandigt namn, personnummer,
  BankID autostart-tokens, fulla bankid://-URL:er.

### 3. Screen-scraping / UI-automation av Skatteverkets sida (HOG RISK)
- **PSD2-parallell**: EU forbjod screen-scraping for banker,
  kravde API-integration istallet. Samma princip kan tillampas.
- Skatteverkets anvandarvillkor kan forbjuda automatiserad atkomst.
- Risk: avstandning, skadestandsansprak, uppsagning av tjanst.

### 4. Bryta mot BankID:s villkor (AVTALSBROTT)
- BankID:s "Saker start" (obligatorisk sedan 2024-05-01) kraver
  rorlig QR-kod och att anvandaren sjalv initierar inloggningen.
- Att fanga autostart-tokens eller manipulera QR-flodet
  kan bryta mot BankID:s sakerhetskrav.

---

## Vad som KRAVS for att gora det lagligt

### Minimikrav (compliance-gate)

| Krav | Beskrivning |
|------|-------------|
| Rattslig grund | Samtycke ELLER avtal per datatyp (GDPR art. 6) |
| Dataminimering | Logga INTE personnummer, namn, tokens i klartext |
| Retention | Kort lagringstid, automatisk radering |
| Atkomstkontroll | Begransad lasning av loggar, kryptering |
| Transparens | Exakt info om vad som lagras, varfor, hur lange |
| DPIA | Konsekvensbedoming om hog risk foreligger |
| Avtalsstod | Verifiera att BankID/SKV tilllater ert flode |
| Signering | Anvandaren MASTE signera sjalv |

---

## WORKAROUNDS -- lagliga alternativ

### Alt A: Ombud-vagen (BAST)

Skatteverket har redan ett **ombud-system** for privatpersoner:

1. Anvandaren utser ditt foretag som ombud via Skatteverkets e-tjanst.
2. Ditt foretag far behorighet att utfora arenden for anvandarens rakning.
3. Ni fyller i flyttanmalan som ombud -- LAGLIGT.

**Problem**: Ombudsbehorigheterna verkar idag begransade till
deklaration, skattekonto och fastighetstaxering.
Folkbokforing/flytt finns INTE bland listade behorigheter.

**Workaround**: Kontakta Skatteverket och fraga om ombud
kan utvidgas till folkbokforing, eller om partner-API
for flytt ar mojligt.

### Alt B: Partner-API (IDEAL)

Skatteverket erbjuder **partner-API:er** for digitala samarbeten:

- Avtalsprocess finns: skatteverket.se/omoss/digitalasamarbeten
- Det finns redan API:er for folkbokforingsuppgifter (offentliga aktorer)
- Det finns API for "meddela felaktig folkbokforingsadress"

**Rekommendation**: Ansok om partner-API for flyttanmalan.
Da slipper ni UI-automation helt och har avtalsstod.

```
+---------------------------+
|   DIN WEBBSIDA            |
|   Anvandaren fyller i     |
+---------------------------+
           |
           v
+---------------------------+
|   PARTNER-API (SKV)       |
|   Skickar data direkt     |
|   via avtalat API         |
+---------------------------+
           |
           v
+---------------------------+
|   SIGNERING (BankID)      |
|   Anvandaren signerar     |
|   via SKV:s eget flode    |
+---------------------------+
```

### Alt C: "Forifylla + redirect" (ENKLAST)

Istallet for att automatisera Skatteverkets sida:

1. Anvandaren fyller i uppgifter pa din sida.
2. Du genererar en URL med forifylla parametrar (om SKV stodjer det).
3. Anvandaren redirectas till SKV:s sida med forifylla falt.
4. Anvandaren loggar in och signerar sjalv.

**Fordel**: Ingen automation, ingen screen-scraping, inget dataintrang.
**Nackdel**: SKV:s flyttanmalan stodjer troligen inte forifylla-URL:er.

### Alt D: "Instruktionsguide" (SAFEST)

1. Anvandaren fyller i pa din sida.
2. Du visar en steg-for-steg-guide: "Ga till SKV, fyll i sa har..."
3. Ev. kopiera-knappar for varje falt.

**Fordel**: Noll juridisk risk.
**Nackdel**: Inte den "smarta" upplevelsen du vill ha.

### Alt E: Nuvarande Playwright-flode (HOGST RISK)

Det du byggt nu. Kan fungera MED foljande kontroller:

1. Anvandaren MASTE sjalv scanna QR och logga in.
2. Inga personuppgifter loggas i klartext.
3. Tydlig ToS + samtycke per session.
4. Anvandaren MASTE sjalv signera.
5. Verifiera att SKV:s villkor inte forbjuder automation.
6. Verifiera att BankID:s villkor tillater flodet.

**Risk**: Aven med alla kontroller kan SKV eller BankID
stanga ner er om de anser att ni bryter villkoren.

---

## Riskmatris

```
+---------------------+----------+------------------+
| Alternativ          | Risk     | Lagligt?         |
+---------------------+----------+------------------+
| A: Ombud-vagen      | LAG      | Ja (om behorighet|
|                     |          | finns for flytt) |
+---------------------+----------+------------------+
| B: Partner-API      | LAG      | Ja (avtalat)     |
+---------------------+----------+------------------+
| C: Forifylla+redir  | LAG      | Ja               |
+---------------------+----------+------------------+
| D: Instruktionsguide| INGEN    | Ja               |
+---------------------+----------+------------------+
| E: Playwright-auto  | HOG      | Grazont -- beror |
|                     |          | pa villkor/impl. |
+---------------------+----------+------------------+
```

---

## Rekommenderad strategi

1. **Kort sikt**: Rensa loggningen i skv3.py (ta bort personnummer,
   namn, tokens). Lagg till tydlig ToS. Lat anvandaren sjalv logga in
   och signera.

2. **Medellang sikt**: Kontakta Skatteverket om partner-API for
   flyttanmalan eller utokad ombudsbehorighet for folkbokforing.

3. **Lang sikt**: Bygg om till API-baserad integration (Alt B).
   Da ar ni helt compliant och slipper Playwright.

---

## Kallor

- IMY -- Rattslig grund: imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/
- IMY -- Sakerhetsloggning: imy.se/verksamhet/dataskydd/.../sakerhetsloggning-och-logganalys/
- IMY -- Inbyggt dataskydd: imy.se/verksamhet/dataskydd/.../inbyggt-dataskydd-och-dataskydd-som-standard/
- Brottsbalken 4 kap 9c (dataintrang): lagen.nu/begrepp/Dataintrang
- Skatteverket -- Ombud for privatperson: skatteverket.se/privat/skatter/ombud
- Skatteverket -- Ombudsbehorigheter: skatteverket.se/.../ombudsbehorigheter
- Skatteverket -- Partner-API: skatteverket.se/omoss/digitalasamarbeten
- Skatteverket -- Folkbokforings-API: skatteverket.se portal/apier-och-oppna-data
- PSD2 screen-scraping: yapily.com/blog/psd2-screenscraping-apis
- BankID Saker start: bankid.com/foretag/saker-start
