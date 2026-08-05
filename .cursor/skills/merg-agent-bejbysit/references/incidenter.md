# Incidenter bakom merge-agentens regler

Varför reglerna i [`SKILL.md`](../SKILL.md) ser ut som de gör. Läs bara vid behov —
den som kör ett svep behöver reglerna, inte historiken.

## Tidsfilter på bot-fynd felar åt båda hållen (2026-07-25)

| Fel | Vad som hände |
|---|---|
| Filtrerade bort ett olöst fynd | #610 mergades förbi ett Vercel-fynd från 05:47 eftersom svepet frågade efter fynd nyare än 05:55. Författarens sista fix kapades och fick bli #619 |
| Blockerade på ett redan löst fynd | #613 blockerades på tre fynd som låg på en äldre commit och var åtgärdade sedan länge. Kostade en aktiv agent en runda i onödan |

Slutsats: fråga alltid "är varje fynd åtgärdat på nuvarande head?", aldrig "har
något landat sedan jag sist tittade?". Jämför `original_commit_id` mot head.

## Ett mekaniskt merge-löfte kapade en pågående fix (#610, 2026-07-25)

En konfliktnot innehöll löftet "säg till när den är grön, så mergar jag". PR:en
blev grön och mergen kapade en pågående fix med en minuts marginal. Grönt CI och
en passerad klocka säger att *det som är pushat* håller — inte att författaren är
färdig med att pusha.

Rätt formulering: *"ping mig när du är klar, så tar jag grinden."*

## Grönt CI är inte ett godkännande (#607, 2026-07-25)

#607 mergades på grönt CI medan dess författaragent fortfarande hade en commit på
gång till samma PR. Arbetet gick inte förlorat, men det fick brytas ut till en
egen PR i efterhand. Det är detta `merge:ready` finns för att förhindra: bara
författaren vet när den är färdig med att pusha.

## Commit-tid är inte samma sak som synlighet (Codex-P1 på #612)

`.commit.committer.date` är metadata från när commiten skapades lokalt. En
författare kan committa 03:00 och pusha till en befintlig PR strax före merge —
commit-tiden hade då sagt "en timme gammal" i samma stund som koden blev
granskningsbar. CI triggas av pushen, så tidigaste `started_at` bland head:ets
check-runs är rätt proxy.

## jq-uttrycket som alltid svarade sant

En tidigare variant av sign-off-kontrollen band inte `.` innan pipen, vilket fick
uttrycket att jämföra `$head` med sig självt och **alltid** svara sant. Nuvarande
variant binder `.headRefOid as $head` först.

Sensmoral: kör alltid sign-off-kontrollen mot en PR med känt inaktuell sign-off
innan du litar på den.

## Ordningen sign-off före label (#665, 2026-07-30)

Labeln `merge:ready` sattes 20:12:24 och sign-off-kommentaren 20:12:27 — båda
inne i fönstret där `merge-ready-freshness.yml` körde på en bot-kommentar. Körningen
såg en labelad PR utan sign-off och rev labeln, trots grön grind och oförändrad
head-SHA. Skriv därför alltid sign-off-kommentaren **först**, labeln sedan.
Detaljerna ligger i [`docs/runbooks/pr-merge-gate.md`](../../../../docs/runbooks/pr-merge-gate.md).
