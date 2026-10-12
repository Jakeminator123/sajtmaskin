# Chatt 1 — kontrakt och projektberedning

Owner: chatt 1. Disposition och status: [master](00-master-plan.md).

Gör [A1](aktiviteter/A1-typat-byggunderlag.md), därefter
[A2](aktiviteter/A2-projektkandidat-och-eval.md) och efter avstämning
[C1](aktiviteter/C1-serveragd-efterkontroll.md). Varje aktivitet delas vid behov
i ett litet beteendebevarande paket följt av beteendeändringen. Gör inte en
stor samtidiga-rename/flytt/omskrivning.

Primära ytor: `src/lib/gen/orchestrate/`, `generation-input-package.ts`,
`src/lib/own-engine/session/`, berörda engine-routes och finalize/eval.
C1 utvidgar uttryckligen till chat-hooks och serverns verifieringslivscykel.
Tester följer den kod som ändras. Delade docs/config uppdateras genom en
samordnad handoff till 2, eller uttrycklig tilldelning — aldrig två skrivare.

En ägare per beslut. Befintligt underlag förbättras; inget nytt globalt
context-objekt som alla måste känna till. Tidig syntaxtvätt, slutlig
projektgranskning och runtimekontroller har olika uppgifter.

Bevara explicita tomma listor, avsiktliga borttagningar, imported-repo-kontrakt,
skyddade dossierfiler, F2/F3 och snabbredigering. Samma versions-ID kan få ny
files_revision; återanvänd inte gamla verifieringsbevis efter mutation.

Start: registrera dig enligt startprompten. Ta sedan bara tilldelat paket.
Läs inte 2:s hela inventering eller all historisk plantext.
