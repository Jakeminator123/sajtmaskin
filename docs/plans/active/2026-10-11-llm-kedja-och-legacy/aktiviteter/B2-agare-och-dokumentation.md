# B2 — färre parallella sanningar

Utförare: 2. Beroende: respektive kodpaket eller uttrycklig fristående tilldelning.
Status: se [körbordet](../00-master-plan.md).

## Ändring

- Använd befintligt `config/control-plane/` som index, inte ny runtime-policy.
  Kod/deklarativ owner först; konsument och validator därefter, docs sist.
- `config/user_degraded_env.txt` har en Backoffice-editor men ingen runtime-loader.
  Konsolidera texten med rätt env-kontrakt och ta bort onödig egen editor om
  ingen egen produktnytta återstår. Gör ingen implicit ändring i env-beteendet.
- Rätta aktuell `src/lib/gen/README.md`, `docs/architecture/llm-pipeline.md`
  och missvisande stegkommentarer när implementationen är fast. Exempel från
  basen: preview beskrivs som HTML/shims; engine-kommentaren och finalize-kontraktet
  anger olika ordning; init/followup bygger fan-in manuellt trots förenklad docbild.
- Håll mänsklig översikt tunn. Ta bort duplicerad steg-/fältbeskrivning och
  ersatt historik; skapa inte en permanent manual av denna plan.
- Ändra genererade vyer via deras generator bara när owner ändrats.
  `declared-only` är inte i sig en raderingssignal: tooling kan vara konsument.

## Klart och verifiering

En pekare per konkret beslut, inga konkurrerande definitioner. Uppdatera
Backoffice-registrering/schema/domänkarta om en sida tas bort. Kör då
`backoffice:test`; annars docs-/registerkontroller som berörs. Typkontroll behövs
om TypeScript ändras, inte för ren prosa. Länkar och genererade referenser ska stämma.

## Resultat

B2.1 implementerad: oparsad `user_degraded_env.txt` och egen Backoffice-editor
borttagna; navigation, ownerregister, projektion och docs synkade. Unik
vägledning finns i env-kontraktet. Tolv filer, netto −101 rader. B1.2 gör
dossierEnvScope obligatoriskt för env.example och tar bort dess oanvända
scope-lösa gren: två filer, netto −35 rader. Resolverns fullkatalogläge består.
102 riktade tester, typecheck, control-plane-check, docs-check/docs-links och
diff-check PASS. Backoffice: 701/702 gröna i helkörningen; ett indexbaserat test
såg raderad editor före staging. Efter staging av endast raderingen passerade
berörd kontraktstestfil (tre tester); tidigare oförändrade resultat återanvänds.
Readonly-review utan kodfynd; ett prosa-fynd i `docs/ENV.md:246` ska rättas.
B2.2 lokalt klar: tunn owneröversikt i gen/README och llm-pipeline, korrigerad
env-scopebeskrivning samt engine-kommentar efter A2.2. Fyra filer +213/−621,
netto −408 rader; inga runtimeändringar. Unika livscykel-/debiteringsinvariants
och kvarvarande klientkontroller bevaras. docs:check, docs:links, diff-check
och verifieringsplan PASS. 30 andra frysta filer och staging oförändrade.
Readonly-review klar utan fynd, fyra scopehashar stabila. Env-scopefyndet är
stängt. Ingen C1-klarhet påstås.
