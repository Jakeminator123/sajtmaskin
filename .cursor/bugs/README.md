# .cursor/bugs/

Lokal mirror av buggrapporter. Mappen är **gitignored** och ligger alltså inte på GitHub.

Linear är fortsatt källan till sanning för status, tilldelning, prioritet och kommentarer. Filerna i den här mappen är lokala kopior som används för snabb läsning, grep, felsökning och för att Cursor-agenter inte ska rapportera samma bugg flera gånger.

## Syfte

- Samla lokala kopior av buggar som rapporteras via `/buggrapport`.
- Ge Cursor-agenter kontext om redan kända buggar innan de letar efter nya.
- Göra det möjligt att snabbt grep:a och läsa tidigare rapporter utan att öppna Linear.
- Undvika dubletter genom att agenter först läser denna mapp innan nya buggar föreslås eller skapas.
- Behålla Linear som riktig historik och källa till sanning.

Mappen är **inte** i `.cursorignore`, eftersom Cursor-agenter ska kunna läsa innehållet.

## Hur buggar hamnar här

Buggar kan komma in på två sätt:

1. **Via `/buggrapport`**
   - En bugg rapporteras manuellt.
   - En Linear-issue skapas.
   - En lokal kopia sparas i denna mapp.

2. **Via Cursor-agent eller automation**
   - Agenten söker efter buggar i repot.
   - Innan nya buggar rapporteras ska agenten läsa denna mapp.
   - Buggar som redan finns här får inte rapporteras igen.
   - Om agenten skapar en Linear-issue ska den också skapa en lokal kopia här.

## Viktigt om status

Den lokala filen är bara en frusen kopia av buggrapporten när den skapades.

Status ska inte hanteras här som primär källa. Kontrollera alltid Linear för aktuell status, tilldelning, prioritet och kommentarer.

När en bugg är åtgärdad ska motsvarande lokala buggdokument raderas från denna mapp. Linear behåller den riktiga historiken.

## Filnamn-konvention

```text
YYYY-MM-DD_HHMM_<LINEAR-ID>_<kort-slug>.md
