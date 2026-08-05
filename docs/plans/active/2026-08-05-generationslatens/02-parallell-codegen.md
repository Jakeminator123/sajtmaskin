# Steg 4: parallell codegen — beslutspunkt

Detta är **inte** beställt arbete. Det kräver uttryckligt ägar-OK enligt
[`mvp-scope-freeze.mdc`](../../../../.cursor/rules/mvp-scope-freeze.mdc), som
säger att en tråkig robust fix går före en elegant ny abstraktion fram till
MVP-leverans. Filen finns för att beslutet ska kunna fattas på underlag i
stället för på magkänsla, och för att steg 1–3 i [`00-master-plan.md`](00-master-plan.md)
inte ska blandas ihop med det här.

## Varför det ens är på bordet

Steg 1–3 tar ungefär en tredjedel av en tung init-körning. De rör inte det som
utgör 79–99 % av tiden: att modellen skriver ut kod token för token, seriellt,
i ungefär 134–182 tokens per sekund. Ingen orkestreringsförändring i världen
gör den serien snabbare. Det finns tre sätt att komma åt den — färre tokens
(steg 2), snabbare modell (produktbeslut, inte pipeline), eller flera strömmar
samtidigt. Det sista är det här.

## Formen, om det görs

```text
kontraktspass (billig, en gång)
   → designtokens, delade komponenter, package.json, filmanifest
        ↓
   N parallella workers, en per filgrupp
        ↓
   merge → befintlig finalize oförändrad
```

Kontraktspassets hela syfte är att workers inte ska behöva komma överens i
efterhand. Utan det producerar tre agenter tre tolkningar av samma scaffold och
variant, och mergen blir en designfråga i stället för en filoperation.

## Vad som gör det dyrt

Det är inte själva fan-outen. Det är att **hela finalize-kedjan antar en
kandidatuppsättning**.

| Antagande | Var det bor |
|---|---|
| En content-uppsättning att merga mot föregående version | `finalize-merge.ts` + `finalize-version/` |
| Scaffold-skydd, dossier verbatim-policy, follow-up-bevarande körs en gång | samma |
| En rad per generation | `engine_generation_logs` |
| En debitering per generation | credit-flödet |
| En SSE-ström till buildern | stream-handlers + `MessageList` |
| Fas 2–3 beskriver en linjär kedja | `docs/architecture/llm-pipeline.md` — omskrivning, inte tillägg |

Dessutom: N workers behöver var och en merparten av prompten. Blogg-körningen
hade 121k prompt-tokens. Tre workers gör det till ~364k input-tokens per
generation. Vinsten är väggklocka, priset är input-kostnad.

## Två sätt att göra det, med olika prislapp

**Spike (dagar).** En feature-flaggad gren som bara körs på init, bara när
route-planen har ≥ 4 sidor, och som faller tillbaka till dagens enda ström vid
minsta avvikelse. Kontraktspassets output är ett filmanifest; workers får varsin
disjunkt filgrupp; mergen är en ren konkatenering eftersom grupperna inte
överlappar. Syftet är att **mäta** om 40–50 % faktiskt går att ta ut, inte att
skeppa. Credits debiteras som idag (en generation), telemetrin får en extra
meta-nyckel, ingen UI-ändring, inget kontrakt rörs.

**Produktion (veckor).** Allt ovan plus: konfliktlösning när workers ändå rör
samma fil, per-worker felhantering och partiell retry, credit-modellen,
SSE-multiplexing, follow-up-vägen, och omskrivningen av Fas 2–3. Det är där
veckorna ligger — inte i parallelliseringen utan i att göra den ärlig mot
befintliga kontrakt.

## Rekommendation

Ta steg 1–3 först. De är billiga, de rör inga kontrakt, och de ger data som gör
den här frågan lättare: visar mätningen efteråt att en typisk init-körning
landar under två minuter, är det inte säkert att steg 4 är värt sin
komplexitet alls.

Blir svaret ändå ja: kör spiken, mät, och besluta om produktion på den siffran.
Ta aldrig produktionsvarianten som första steg.

## Villkor för att ens öppna frågan

- Steg 1 mergat, så vinsten går att mäta i stället för att uppskattas.
- Steg 2 utvärderat, så man vet hur mycket output som är kvar att dela.
- Uttryckligt ägar-OK, eftersom scope-frysen annars gäller.
- Follow-ups undantagna. De ligger på 47–71 s med `changeScope: local-layout`
  och få filer; fan-out-overheaden äter sannolikt upp vinsten.
