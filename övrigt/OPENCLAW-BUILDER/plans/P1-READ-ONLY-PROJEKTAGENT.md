# P1 — read-only projektagent

## Mål

Göra OpenClaw genuint kapabel att navigera i ett ägt projekt utan att kunna
ändra någonting.

## Leveranser

- separat `openclaw-builder`-identitet/service
- tool broker med per-jobb-token
- `job.get`
- `project.snapshot`
- `project.list_files`
- `project.read_file`
- `project.search`
- `orchestration.explain`
- `preview.status`, scrubbed `preview.logs` och screenshot-artifact
- revisionsbundet serverminne/sammanfattning
- full audit av calls och denies

## Arbetssteg

1. Skapa intern service utan persistent projektworkspace.
2. Implementera broker med tenant/chat/version/revision-check per call.
3. Lägg pagination, byte-, träff- och tokenbudget.
4. Pinna allt underlag till exakt base SHA/revision.
5. Testa falska ids, path traversal, expired/replayed token och cross-tenant.
6. Visa context/tool receipts i intern diagnostik.
7. Låt agenten svara på kodfrågor men inte påverka buildern.

## Acceptans

- agenten kan hitta en namngiven symbol och förklara dess beroenden i större
  projekt utan fulltextdump
- alla försök mot annan tenant/version nekas
- ingen skrivroute eller generellt nätverk finns
- ett versionsbyte invalid­erar tidigare projektminne
- nuvarande Sajtagenten-service är oförändrad och fortsatt minimal

## Stoppskäl

- shared workspace/session mellan tenants
- rå DB-token hos agenten
- tool auth bygger på promptinstruktion i stället för brokerpolicy
- screenshot/loggar kan läcka hemligheter
