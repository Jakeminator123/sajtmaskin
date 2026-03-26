# PLAN — K-019: Orchestration snapshot (promptkedja)

**Status:** öppen — delmoment **Agentlogg hopfälld som standard** levererat; **snapshot över stream-steg** kvar.

**Kanonisk bakgrund:** [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) § 0 (*Promptkedja*), § 3 · [`../kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md) (rad **K-019**) · [`.j_to_agent/fidelity.txt`](../../../../.j_to_agent/fidelity.txt)

## Beslut som måste ligga fast först

Se **[`BESLUT-INNAN-VI-GAR-VIDARE.md`](./BESLUT-INNAN-VI-GAR-VIDARE.md) § 4** (lagring, merge vs ersätt, gränser).

## Teknisk riktning (efter beslut)

1. Identifiera var **förberedd orchestration-kontext** skapas idag (stream-steg, follow-up).
2. Definiera **serialiserat snapshot-format** och **versionsnyckel** (t.ex. per `chatId` + steg-index).
3. **Infoga** läsning/skrivning i befintlig meddelande-/stream-kedja utan att duplicera hela prompten i UI.
4. Verifiera: `npm run typecheck`, `npx vitest run`, manuell builder-smoke (första prompt → follow-up → kontext oförändrad intention).

## När denna plan kan arkiveras

När **K-019** är **[x]** i `kritik-consolidated-open-items.md` med datum och snapshot-beteendet är verifierat.
