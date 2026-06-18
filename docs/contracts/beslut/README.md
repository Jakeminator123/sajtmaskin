# Beslut (ADR)

Kort beslutslogg. ADR = Architecture Decision Record. En fil per arkitekturval som
annars skulle glömmas eller återöppnas. Snärtig, inte rigorös.

**Mall (håll under ~25 rader):**

```
# ADR NNNN — <kort titel>
- Status: föreslagen | accepterad | ersatt
- Datum: YYYY-MM-DD

## Beslut
<1–3 meningar: vad vi bestämde.>

## Varför
<1–3 meningar: problemet det löser.>

## Inte detta
<vad beslutet uttryckligen INTE innebär.>
```

Numrera löpande (`0001`, `0002`…). Ersatt beslut: sätt status `ersatt` + länk till
efterföljaren — radera inte.
