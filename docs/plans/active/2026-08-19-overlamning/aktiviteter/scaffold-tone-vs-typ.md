# Scaffold-matchningen kan välja fel sajttyp

Våg 2 · Cloud · Ur svärmläsning, ej omverifierad · Två delar

## Del 1 — tonfall räknas som typnyckelord

`toneAndVoice` slås ihop med `domainHints` och körs genom `buildKeywordScores`.
Tonorden «personal» och «creative» räcker då för att lyfta `portfolio` till
minimipoängen, och vid lika poäng vinner `portfolio` över `landing-page` för att
den står först i listan.

En landningssida med personlig ton kan alltså bli en portfolio.

Tonfall är **hur** sajten låter, inte **vad** den är. Att blanda ihop dem gör
typvalet oförutsägbart för fullt rimliga briefformuleringar.

Ankare (omverifiera — filen ändrades 19 augusti):

- `src/lib/gen/scaffolds/matcher.ts:196-214` (sammanslagningen)
- poänggränsen kring `matcher.ts:65`
- tie-break i `pickBestScaffold` kring `matcher.ts:374-380`
- ordbanken i `keyword-banks.ts:82-84`

**Fix:** håll `toneAndVoice` utanför typ-nyckelordspoängen. Tonen ska fortsätta
påverka embedding-prompten och designuttrycket — bara inte sajttyp-poängen.

**Bevis:** ett test där brief med typsignal «landing» plus tonorden
personal/creative fortfarande väljer `landing-page`. Testet ska **falla före**
fixen.

## Del 2 — de nya matchningstesterna är falskt gröna

`src/lib/gen/orchestrate/scaffold-query-context.test.ts` (kring rad 48) sätter
`useEmbeddings: false`, medan produktion kör **med** embeddings (default sätts i
`orchestrate/resolve-base.ts:102` och `matcher.ts:684`).

Testerna bevisar alltså keyword-vägen — inte den väg som faktiskt körs. Grönt
här säger ingenting om verkligt beteende. `AGENTS.md` klassar just det som P1:
status som blir grön utan verklig verifiering.

**Fix:** lägg till täckning för embeddings-vägen med ett deterministiskt mockat
embedding-anrop. **Ta inte bort** keyword-testerna — komplettera dem.

## Verifiering

```powershell
npm run typecheck
npm run scaffolds:validate
npx vitest run src/lib/gen/scaffolds src/lib/gen/orchestrate
```

Visa i PR-beskrivningen att det nya testet faller före fixen och passerar efter.

## Gör inte

- Skriv inte om rangordningen i `pickBestScaffold` bredare än tie-breaken kräver.
- Rör inte variantvalet eller `stylePack` — annan ägare, annat fynd.
- Ta inte bort befintliga tester för att få grönt.
