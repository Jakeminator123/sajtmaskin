# Chatt 2 — rensa och minska dubbla sanningar

Owner: chatt 2. Disposition och status: [master](00-master-plan.md).

Utför [B1](aktiviteter/B1-legacy-rensning.md) och
[B2](aktiviteter/B2-agare-och-dokumentation.md). Börja med smal caller-recon,
inte en ny totalinventering av repot. Prioritera faktisk borttagning framför
att lägga till förklaringar runt död kod.

Primära ytor efter tilldelning: legacy-preview, separata MCP-generatorn,
`knip.json`, kompatibilitetsgränser, env-fallback och relevanta Backoffice/docs.
Finalizerns kontrakt/kandidat och efterkontrollens samordning ägs av 1.
En upptäckt där rapporteras till samordnaren i stället för att ändras här.

Varje kandidat får en kort disposition: REMOVE, CONSOLIDATE, KEEP eller
NEEDS-OWNER/EVIDENCE, med caller-bevis och motivering. Ingen ny inventeringsfil
utöver B1:s resultat. KEEP är ett beslut, inte ett misslyckande.

Gamla namn är inte bevis på dödkod: `/api/v0/deployments` har aktiva konsumenter.
`declared-only` betyder inte oanvänd; exempelvis env-policy används av tooling.
Ta bort intern överflödighet direkt när dess användningsbild är klar. Externa
ytor följer befintligt trafik-/ägarbeslut, utan att blockera andra kandidater.
