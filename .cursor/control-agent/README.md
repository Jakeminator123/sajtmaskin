# Control Agent

Den här ytan är den lokala arkiv- och sammanfattningsytan för `/control-agent`.

Syfte:

- hålla `workstream-sentry`-reviewer separerad från `orchestrator`, `verifier` och `debugger`
- låta lokala review-körningar arkiveras bort från normal arbetsyta
- bara lämna en liten, mänskligt läsbar sammanfattningsyta synlig i repot

Struktur:

- `run/`
  Aktiv lokal yta för tillfälliga control-agent-körningar.
- `archive/`
  Arkiverade control-agent-körningar. Den här mappen är git-ignorerad.
- `review-summaries.md`
  Kort sammanfattningsindex över avslutade eller arkiverade control-agent-pass.

Regler:

- Lägg inte nya långlivade arbetsartefakter direkt i repo-roten.
- Om en control-agent-körning behöver spara lokal kontext, lägg den först under
  `run/<YYYY-MM-DD>-<slug>/`.
- När den körningen inte längre behöver ligga kvar aktivt, flytta den till
  `archive/` och append:a en kort rad i `review-summaries.md`.
- `workstream-sentry` är findings-only. Den ska föreslå buggar och risker, inte
  göra ändringar själv.
