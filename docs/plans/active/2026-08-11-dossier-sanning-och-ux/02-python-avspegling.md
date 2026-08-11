# 02 — Radera Python-kopiorna av TS-regler och ordlistor

**Mål:** backoffice slutar äga egna kopior av regler/ordlistor; allt läses ur den CI-grindade
projektionen. Fyra speglingar och tre text-parsnings-tester försvinner.
**Byggmodell:** medel (`cursor-grok-4.5`). **Beroenden:** plan 01 mergad.

## Varför

I dag speglar Python fyra TS-fakta och håller dem ärliga med tester som **parsar TS-källkod
som text** (`MockLabelParityTests`, `RequiresF3ParityTests`, `MocklessExceptionParityTests`).
Mönstret fångar borttagna villkor men inte tillagda, och binder tester till källkodens
formatering. Med plan 01 finns en färsk, grindad projektion — speglingarna behövs inte längre.

## Steg

1. **Utöka projektionen med svenska etiketter.** Generatorn importerar `describeDossierClass`,
   `describeDossierMockMode`, `describeF3Requirement` från `src/lib/builder/dossier-axes.ts`
   och skriver färdiga `labelsSv` (klass, demoläge, kräver-F3 — label + hint) per dossier,
   plus en `policy`-nod med `mocklessCapabilityExceptions` (ur `validate-manifest.ts`).
   `dossier-axes.ts` förblir enda ordlisteägaren; projektionen bär bara ut orden.
2. **Python läser i stället för att kunna.**
   - `CLASS_LABELS`, `MOCK_LABELS` (constants.py) → läs `labelsSv` ur projektionen.
   - `requires_f3()` (labels.py) → läs `buildServerRequirement` ur projektionen
     (skrivvägar som behöver döma ett OSPARAT manifest-utkast får behålla en lokal
     regel ENDAST om utkastet ännu inte finns i projektionen — dokumentera i så fall varför,
     och håll den grindad mot projektionens fält för alla sparade dossiers).
   - `_load_mockless_capability_exceptions()` (io.py) → läs `policy`-noden; radera TS-regex-läsaren.
3. **Radera testerna som ersätts:** `MockLabelParityTests`, `RequiresF3ParityTests`,
   `MocklessExceptionParityTests` i `backoffice/test_dossiers_page.py`. Ersätt med enkla
   läsartester mot en fixture-projektion (etikett saknas → tydligt fel, inte tom sträng).
4. **Behåll** `SwedishLabelCoverageTests`-idén i ny form: varje enum-värde i strict-schemat
   ska ha en etikett i projektionen (fångar nytt mock-värde utan ord).
5. **Fallback-beteende:** när projektionen saknas/är trasig ska backoffice visa rått tekniskt
   värde + varning (aldrig gissa svenska ord, aldrig krascha).

## Raderingar (listas i PR:en)

- `CLASS_LABELS`, `MOCK_LABELS`, `_MOCKLESS_FALLBACK`-kedjan i `dossiers_lib/constants.py`
- `requires_f3`-regeln i `dossiers_lib/labels.py` (ersatt av projektionens fält)
- TS-textläsaren i `_load_mockless_capability_exceptions`
- Tre paritetstestklasser i `test_dossiers_page.py`

## Obs

Det tidigare beslutade lilla `CLASS_LABELS`-paritetstestet (TS↔Python) blir **överflödigt**
i och med denna plan — bygg det inte separat om denna plan är på väg; den strukturella
lösningen ersätter det.

## Verifiering

`python -m pytest backoffice/` grönt; `npm run backoffice:test`; typecheck/lint/hygiene;
manuell rök: backoffice-listan visar samma ord som builderns Byggblock-panel för samma dossier.

## Definition of done

Noll TS-fakta-kopior i Python; noll text-parsnings-tester; backoffice fungerar med bara
projektionen som faktakälla; raderingslistan står i PR-beskrivningen; bugbot-pass dokumenterat.
