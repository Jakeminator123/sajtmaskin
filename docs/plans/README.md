# Plans

**[`active/README.md`](./active/README.md) är den enda aktiva planytan** — ett koncentrat (1–2 sidor) som router till varje aktivt spår och destillerar öppna P1/P2. Resten är historik.

| Mapp | Vad |
|---|---|
| [`active/`](./active/README.md) | Koncentratet (enda aktiva ytan). |
| [`archived/`](./archived/) | Vilande, parkerade (`archived/parked/`), skrotade och in-syntetiserade planer. Filnamn bevarade så länkar/historik resolvar. |
| [`avklarat/`](./avklarat/README.md) | Implementerat och mergat — historik. |

Lifecycle-kontrakt: [`.cursor/rules/plan-lifecycle.mdc`](../../.cursor/rules/plan-lifecycle.mdc). Orientering: [`documentation-lifecycle.md`](../documentation-lifecycle.md) · [`docs/architecture/README.md`](../architecture/README.md).

Git-historik bevarar allt — väv in nya detaljer i koncentratet eller länka till en arkiverad/avklarad fil; återskapa inte ett filzoo i `active/`.
