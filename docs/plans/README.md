# Plans

**Börja i [`active/README.md`](./active/README.md)** — den aktiva routern till pågående spår och öppna frågor. Stora pågående initiativ får ha länkade detaljplaner under `active/<initiativ>/`; dessa är inte historik bara för att de ligger utanför indexet.

| Mapp | Vad |
|---|---|
| [`active/`](./active/README.md) | Aktiv router och detaljplaner som fortfarande styr pågående initiativ. |
| [`archived/`](./archived/) | Vilande, parkerade, skrotade planer. Filnamn bevarade så länkar/historik resolvar. |
| [`avklarat/`](./avklarat/README.md) | Implementerat och mergat — historik. |

Lifecycle-kontrakt: [`.cursor/rules/plan-lifecycle.mdc`](../../.cursor/rules/plan-lifecycle.mdc). Orientering: [`documentation-lifecycle.md`](../documentation-lifecycle.md) · [`docs/architecture/README.md`](../architecture/README.md).

Git-historik bevarar allt — väv in nya detaljer i koncentratet eller länka till en arkiverad/avklarad fil; återskapa inte ett filzoo i `active/`.
