# Beslut och öppna frågor

## Beslutat i detta arkitekturspår

| Beslut | Skäl |
| --- | --- |
| Hybrid före full ersättning | behåller deterministiska invariants |
| Separat Builder-service | chattgatewayn ska fortsatt vara minimal |
| `GenerationInputPackage` som handoff | redan nära ett färdigt agentkontrakt |
| Version + revision som base | versionId ensam räcker inte |
| Sandbox per jobb | isolering och reproducerbarhet |
| Broker före alla verktyg | ingen rå plattformscredential hos agenten |
| Read-only före writes | stor tidig nytta och låg risk |
| Candidate före persist | agenten får inte skriva source of truth |
| Nuvarande finalize/gates kvar | samma kvalitets- och releasekontrakt |
| Canvas är optional UI | får inte bli state-/policyowner |

## Behöver tekniskt spike

- Vilken sandbox ger bäst cold start och isolation på Render eller annan worker?
- Kan candidate preview återanvända preview-hostkontraktet utan att röra live
  sessionpointer?
- Hur serialiseras hela `GenerationInputPackage` stabilt över deployversioner?
- Vilka filer/blocks måste hashbindas separat för konfigurationsdrift?
- Hur skapas en durable lease utan en andra generationslock-owner?
- Hur scrubbas loggar och screenshots innan de når modellen?
- Vilka package-skript får över huvud taget köras i kandidatfasen?

## Kräver produktbeslut från Jakob senare

- Ska agentläget vara standard, opt-in eller en dyrare byggprofil?
- Hur mycket långsammare får en bättre sajt vara?
- Ska användaren se verktygsfaser eller bara en kort status?
- Ska agenten få göra två repairvarv eller fler mot extra credits?
- Ska användarens eget GitHub kunna kopplas read-only i en senare fas?
- När ska agenten be om förtydligande i stället för att välja själv?
- Ska AI Workflow Canvas vara inbyggd operatorvy, separat app eller inte användas?

## Medvetet inte beslutat

- exakt modell per fas
- exakt hostingprodukt för sandbox
- databas-/köimplementation
- prissättning
- GitHub-write
- autonom live deploy

Inget av detta behövs för P0–P2.
