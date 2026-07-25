# -*- coding: utf-8 -*-
"""Rapportytor: `summary.md` (läsbar) och `report.html` (canvas).

`report.html` är avsiktligt en enda självständig fil utan externa beroenden —
den ska gå att öppna direkt från körningsmappen, mejla vidare eller zippa ihop.
"""

from __future__ import annotations

import html
import json
from typing import Any

VERDICT_TONE = {
    "lyckad": ("#0f7b3f", "#d7f5e3", "Lyckad"),
    "delvis": ("#8a5a00", "#fdf0d5", "Delvis"),
    "misslyckad": ("#a01d1d", "#fbe0e0", "Misslyckad"),
    "okänd": ("#41505e", "#e8edf2", "Okänd"),
}

STATUS_LABEL = {
    "ok": "OK",
    "partial": "Delvis",
    "unavailable": "Ej tillgänglig",
    "no_deployment": "Ingen deploy",
    "skipped": "Hoppades över",
    "error": "Fel",
}


# --------------------------------------------------------------------------- #
# Markdown
# --------------------------------------------------------------------------- #


def render_summary_md(manifest: dict[str, Any]) -> str:
    identity = manifest.get("identity") or {}
    assessment = manifest.get("assessment") or {}
    tokens = manifest.get("tokens") or {}
    totals = tokens.get("totals") or {}
    coverage = manifest.get("coverage") or {}
    sources = manifest.get("sources") or {}
    env = manifest.get("env") or {}

    lines: list[str] = []
    lines.append(f"# Senaste genererade sajten — {identity.get('title') or 'utan titel'}")
    lines.append("")
    lines.append(f"**Bedömning: {assessment.get('verdict', 'okänd')}**")
    for reason in assessment.get("reasons") or []:
        lines.append(f"- {reason}")
    lines.append("")
    lines.append("## Identitet")
    lines.append("")
    lines.append("| Fält | Värde |")
    lines.append("| --- | --- |")
    for label, key in (
        ("chatId", "chatId"),
        ("versionId", "versionId"),
        ("Version", "versionNumber"),
        ("Skapad", "createdAt"),
        ("Modell", "model"),
        ("Scaffold", "scaffoldId"),
        ("Lifecycle", "lifecycleStage"),
        ("Release", "releaseState"),
        ("Verifiering", "verificationState"),
        ("previewUrl", "previewUrl"),
    ):
        lines.append(f"| {label} | {_md(identity.get(key))} |")
    lines.append(f"| Ägare | {_md(owner_label(manifest.get('owner') or {}))} |")
    lines.append(f"| Databas | {_md(env.get('target'))}{' (PROD-LIKE)' if env.get('prodLike') else ''} |")
    lines.append("")

    lines.append("## Tokenförbrukning (loggad, denna version)")
    lines.append("")
    sek_suffix = f" / {_money(totals.get('sek'), 'SEK')}" if totals.get("sek") is not None else ""
    lines.append(
        f"Totalt **{_int(totals.get('totalTokens'))} tokens** "
        f"({_int(totals.get('promptTokens'))} in / {_int(totals.get('completionTokens'))} ut) "
        f"i {_int(totals.get('calls'))} anrop — {_money(totals.get('usd'), 'USD')}{sek_suffix}. "
        f"Källa: `{tokens.get('source')}`."
    )
    lines.append("")
    chat_scope = tokens.get("chat") or {}
    chat_totals = chat_scope.get("totals") or {}
    if chat_totals.get("totalTokens"):
        chat_sek = f" / {_money(chat_totals.get('sek'), 'SEK')}" if chat_totals.get("sek") is not None else ""
        lines.append(
            f"Hela chatten (alla versioner, max `--limit` rader): "
            f"{_int(chat_totals.get('totalTokens'))} tokens i {_int(chat_totals.get('calls'))} anrop "
            f"— {_money(chat_totals.get('usd'), 'USD')}{chat_sek}. Källa: `{chat_scope.get('source')}`."
        )
        lines.append("")
    for note in tokens.get("notes") or []:
        lines.append(f"> {note}")
    if tokens.get("notes"):
        lines.append("")
    by_model = tokens.get("byModel") or []
    if by_model:
        lines.append("| Modell | Anrop | In | Ut | USD | SEK |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for row in by_model:
            lines.append(
                f"| {_md(row.get('model'))} | {_int(row.get('calls'))} | {_int(row.get('promptTokens'))} "
                f"| {_int(row.get('completionTokens'))} | {_money(row.get('usd'), '')} | {_money(row.get('sek'), '')} |"
            )
        lines.append("")
    by_phase = tokens.get("byPhase") or []
    if by_phase:
        lines.append("| Fas | Anrop | Tokens |")
        lines.append("| --- | --- | --- |")
        for row in by_phase:
            lines.append(f"| {_md(row.get('phase'))} | {_int(row.get('calls'))} | {_int(row.get('totalTokens'))} |")
        lines.append("")

    unmeasured = coverage.get("unmeasuredPhases") or []
    if unmeasured:
        lines.append("### Ej mätt i den här körningen")
        lines.append("")
        for row in unmeasured:
            lines.append(f"- **{row.get('label')}** — {row.get('reason')} (`{row.get('owner')}`)")
        lines.append("")
        lines.append(f"> {coverage.get('note')}")
        lines.append("")

    lines.append("## Källor")
    lines.append("")
    lines.append("| Källa | Status | Kommentar |")
    lines.append("| --- | --- | --- |")
    for name, source in sources.items():
        status = str((source or {}).get("status") or "okänd")
        note = (source or {}).get("reason") or "; ".join((source or {}).get("warnings") or []) or ""
        lines.append(f"| {name} | {STATUS_LABEL.get(status, status)} | {_md(note)} |")
    lines.append("")

    db_block = manifest.get("db") or {}
    counts = db_block.get("counts") or {}
    if counts:
        lines.append("## Rader per loggtyp")
        lines.append("")
        lines.append(" · ".join(f"{kind}={value}" for kind, value in counts.items()))
        lines.append("")

    rotation = manifest.get("rotation") or {}
    lines.append(
        f"Mapp: `{manifest.get('runDir')}` · MAX_GEN_LOGS={rotation.get('maxGenLogs')}"
        + (f" · raderade: {', '.join(rotation.get('removed') or [])}" if rotation.get("removed") else "")
    )
    lines.append("")
    lines.append("Read-only insamling. Secrets maskerade. Genererad av `scripts/observability/last-generated-usersite.py`.")
    lines.append("")
    return "\n".join(lines)


def owner_label(owner: dict[str, Any]) -> str:
    """Ägaren i klartext. Okänd ägare ska säga okänd, inte se ut som gäst."""
    if owner.get("userId"):
        return str(owner["userId"])
    if owner.get("guest") is True:
        return "gäst (ingen inloggad användare)"
    if owner.get("unknown"):
        return "okänd (reducerat läge — kräver pg8000)"
    return "okänd"


def _md(value: Any) -> str:
    if value is None or value == "":
        return "–"
    text = str(value)
    return text.replace("|", "\\|")


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _money(value: Any, unit: str) -> str:
    if value is None:
        return "–"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "–"
    text = f"{number:.4f}".rstrip("0").rstrip(".") or "0"
    return f"{text} {unit}".strip()


# --------------------------------------------------------------------------- #
# HTML-canvas
# --------------------------------------------------------------------------- #

_CSS = """
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px; font: 15px/1.55 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  background: #f6f7f9; color: #16202b; }
main { max-width: 1080px; margin: 0 auto; }
h1 { font-size: 24px; margin: 0 0 4px; }
h2 { font-size: 17px; margin: 32px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #dde3ea; }
h3 { font-size: 14px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .04em; color: #5b6b7b; }
p.sub { margin: 0 0 20px; color: #5b6b7b; }
.verdict { display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 10px;
  font-weight: 650; font-size: 17px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 20px 0 8px; }
.card { background: #fff; border: 1px solid #e3e8ee; border-radius: 10px; padding: 14px 16px; }
.card .k { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b7a89; }
.card .v { font-size: 21px; font-weight: 650; margin-top: 4px; word-break: break-word; }
.card .n { font-size: 12px; color: #6b7a89; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e3e8ee;
  border-radius: 10px; overflow: hidden; font-size: 13.5px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
th { background: #f0f3f7; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: #5b6b7b; }
tr:last-child td { border-bottom: none; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.bar { position: relative; height: 8px; border-radius: 4px; background: #e6ebf1; overflow: hidden; min-width: 60px; }
.bar > span { position: absolute; inset: 0 auto 0 0; background: #3b82c4; }
.pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; }
.pill.ok { background: #d7f5e3; color: #0f7b3f; }
.pill.partial { background: #fdf0d5; color: #8a5a00; }
.pill.off { background: #e8edf2; color: #41505e; }
.pill.bad { background: #fbe0e0; color: #a01d1d; }
ul.reasons { margin: 12px 0 0; padding-left: 20px; color: #35485b; }
pre { background: #10161d; color: #d8e2ec; padding: 12px 14px; border-radius: 10px; overflow-x: auto;
  font-size: 12.5px; line-height: 1.5; max-height: 340px; }
code { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.note { background: #fff8e6; border: 1px solid #f0dfae; border-radius: 10px; padding: 12px 14px;
  font-size: 13px; color: #5f4a12; }
footer { margin-top: 36px; color: #77869a; font-size: 12px; }
@media (prefers-color-scheme: dark) {
  body { background: #0f151b; color: #e6edf4; }
  .card, table { background: #161e26; border-color: #26313c; }
  th { background: #1b242d; color: #93a4b6; }
  th, td { border-color: #222c36; }
  h2 { border-color: #26313c; }
  .bar { background: #26313c; }
  .note { background: #241f10; border-color: #4a3d16; color: #e8d69c; }
}
"""


def render_report_html(manifest: dict[str, Any]) -> str:
    identity = manifest.get("identity") or {}
    assessment = manifest.get("assessment") or {}
    tokens = manifest.get("tokens") or {}
    totals = tokens.get("totals") or {}
    coverage = manifest.get("coverage") or {}
    sources = manifest.get("sources") or {}
    env = manifest.get("env") or {}
    verdict = str(assessment.get("verdict") or "okänd")
    fg, bg, label = VERDICT_TONE.get(verdict, VERDICT_TONE["okänd"])

    parts: list[str] = []
    parts.append("<!doctype html><html lang=\"sv\"><head><meta charset=\"utf-8\">")
    parts.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
    parts.append(f"<title>Genlogg — {_h(identity.get('title') or identity.get('chatId') or 'körning')}</title>")
    parts.append(f"<style>{_CSS}</style></head><body><main>")

    parts.append(f"<h1>{_h(identity.get('title') or 'Senaste genererade sajten')}</h1>")
    parts.append(
        f"<p class=\"sub\">Insamlad {_h(manifest.get('collectedAt'))} · "
        f"chat <code>{_h(identity.get('chatId'))}</code> · version <code>{_h(identity.get('versionId'))}</code></p>"
    )
    parts.append(
        f'<div class="verdict" style="color:{fg};background:{bg}">Bedömning: {_h(label)}</div>'
    )
    if assessment.get("reasons"):
        parts.append("<ul class=\"reasons\">")
        parts.extend(f"<li>{_h(reason)}</li>" for reason in assessment["reasons"])
        parts.append("</ul>")

    chat_scope = tokens.get("chat") or {}
    chat_totals = chat_scope.get("totals") or {}

    parts.append('<div class="cards">')
    parts.append(_card("Tokens (denna version)", _group(totals.get("totalTokens")),
                       f"{_group(totals.get('promptTokens'))} in / {_group(totals.get('completionTokens'))} ut"))
    parts.append(_card("Kostnad (loggat)", _money(totals.get("usd"), "USD"),
                       _money(totals.get("sek"), "SEK") if totals.get("sek") is not None else "SEK-kurs saknas"))
    parts.append(_card("LLM-anrop", str(_int(totals.get("calls"))), tokens.get("source") or ""))
    parts.append(_card("Tokens (hela chatten)", _group(chat_totals.get("totalTokens")),
                       f"{_int(chat_totals.get('calls'))} anrop · {chat_scope.get('source') or '–'}"))
    parts.append(_card("Modell", identity.get("model") or "–", identity.get("scaffoldId") or ""))
    parts.append(_card("Ägare", owner_label(manifest.get("owner") or {}),
                       (manifest.get("owner") or {}).get("projectId") or ""))
    parts.append(_card("Databas", env.get("target") or "–", "PROD-LIKE" if env.get("prodLike") else env.get("path") or ""))
    parts.append("</div>")

    parts.append("<h2>Tokenförbrukning per modell (denna version)</h2>")
    parts.append(_token_table(tokens.get("byModel") or []))
    for note in tokens.get("notes") or []:
        parts.append(f'<p class="note">{_h(note)}</p>')
    if tokens.get("byPhase"):
        parts.append("<h3>Per fas</h3>")
        parts.append(_phase_table(tokens.get("byPhase") or []))
    if chat_totals.get("totalTokens"):
        parts.append("<h3>Hela chatten (alla versioner)</h3>")
        parts.append(_token_table(chat_scope.get("byModel") or []))
        parts.append(f'<p class="note">{_h(chat_scope.get("note") or "")}</p>')
    unpriced = sorted({*(tokens.get("unpricedModels") or []), *(chat_scope.get("unpricedModels") or [])})
    if unpriced:
        parts.append(
            f'<p class="note">Utan pris i <code>pricing.json</code>: {_h(", ".join(unpriced))}</p>'
        )

    unmeasured = coverage.get("unmeasuredPhases") or []
    if unmeasured:
        parts.append("<h2>Vad som inte mäts</h2>")
        parts.append(f'<p class="note">{_h(coverage.get("note") or "")}</p>')
        parts.append("<table><thead><tr><th>Fas</th><th>Varför</th><th>Ägare</th></tr></thead><tbody>")
        for row in unmeasured:
            parts.append(
                f"<tr><td>{_h(row.get('label'))}</td><td>{_h(row.get('reason'))}</td>"
                f"<td><code>{_h(row.get('owner'))}</code></td></tr>"
            )
        parts.append("</tbody></table>")

    parts.append("<h2>Källor</h2>")
    parts.append("<table><thead><tr><th>Källa</th><th>Status</th><th>Kommentar</th></tr></thead><tbody>")
    for name, source in sources.items():
        status = str((source or {}).get("status") or "okänd")
        note = (source or {}).get("reason") or "; ".join((source or {}).get("warnings") or []) or ""
        parts.append(
            f"<tr><td>{_h(name)}</td><td>{_status_pill(status)}</td><td>{_h(note)}</td></tr>"
        )
    parts.append("</tbody></table>")

    db_block = manifest.get("db") or {}
    if db_block.get("counts"):
        parts.append("<h2>Rader per loggtyp</h2>")
        parts.append("<table><thead><tr><th>Loggtyp</th><th>Tabell</th><th class=\"num\">Rader</th></tr></thead><tbody>")
        tables = db_block.get("tables") or {}
        for kind, count in (db_block.get("counts") or {}).items():
            parts.append(
                f"<tr><td>{_h(kind)}</td><td><code>{_h(tables.get(kind, ''))}</code></td>"
                f"<td class=\"num\">{_int(count)}</td></tr>"
            )
        parts.append("</tbody></table>")

    signals = assessment.get("signals") or {}
    if signals:
        parts.append("<h2>Signaler</h2>")
        parts.append(f"<pre><code>{_h(json.dumps(signals, ensure_ascii=False, indent=2))}</code></pre>")

    for name, key in (("Preview-logg (Fly)", "fly"), ("Vercel build-logg", "vercelBuild")):
        tail = (manifest.get("tails") or {}).get(key)
        if tail:
            parts.append(f"<h2>{_h(name)}</h2>")
            parts.append(f"<pre><code>{_h(chr(10).join(tail))}</code></pre>")

    rotation = manifest.get("rotation") or {}
    parts.append(
        f"<footer>Mapp <code>{_h(manifest.get('runDir'))}</code> · "
        f"MAX_GEN_LOGS={_int(rotation.get('maxGenLogs'))}"
        + (f" · raderade {_h(', '.join(rotation.get('removed') or []))}" if rotation.get("removed") else "")
        + " · read-only insamling, secrets maskerade · "
        "<code>scripts/observability/last-generated-usersite.py</code></footer>"
    )
    parts.append("</main></body></html>")
    return "".join(parts)


def _card(key: str, value: str, note: str = "") -> str:
    return (
        f'<div class="card"><div class="k">{_h(key)}</div><div class="v">{_h(value)}</div>'
        + (f'<div class="n">{_h(note)}</div>' if note else "")
        + "</div>"
    )


def _group(value: Any) -> str:
    """Tusenavgränsning med tunt mellanslag — lättare att läsa stora tokental."""
    return f"{_int(value):,}".replace(",", "\u202f")


def _token_table(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return '<p class="note">Inga loggade tokens för den här körningen.</p>'
    peak = max((_int(row.get("totalTokens")) for row in rows), default=0) or 1
    out = [
        "<table><thead><tr><th>Modell</th><th class=\"num\">Anrop</th><th class=\"num\">In</th>"
        "<th class=\"num\">Ut</th><th>Andel</th><th class=\"num\">USD</th><th class=\"num\">SEK</th>"
        "</tr></thead><tbody>"
    ]
    for row in rows:
        share = round(100 * _int(row.get("totalTokens")) / peak)
        label = row.get("priceLabel") or row.get("model")
        out.append(
            f"<tr><td>{_h(label)}<br><code>{_h(row.get('model'))}</code></td>"
            f"<td class=\"num\">{_int(row.get('calls'))}</td>"
            f"<td class=\"num\">{_group(row.get('promptTokens'))}</td>"
            f"<td class=\"num\">{_group(row.get('completionTokens'))}</td>"
            f'<td><div class="bar"><span style="width:{share}%"></span></div></td>'
            f"<td class=\"num\">{_h(_money(row.get('usd'), ''))}</td>"
            f"<td class=\"num\">{_h(_money(row.get('sek'), ''))}</td></tr>"
        )
    out.append("</tbody></table>")
    return "".join(out)


def _phase_table(rows: list[dict[str, Any]]) -> str:
    out = ["<table><thead><tr><th>Fas</th><th class=\"num\">Anrop</th><th class=\"num\">Tokens</th></tr></thead><tbody>"]
    for row in rows:
        out.append(
            f"<tr><td>{_h(row.get('phase'))}</td><td class=\"num\">{_int(row.get('calls'))}</td>"
            f"<td class=\"num\">{_group(row.get('totalTokens'))}</td></tr>"
        )
    out.append("</tbody></table>")
    return "".join(out)


def _status_pill(status: str) -> str:
    tone = {
        "ok": "ok",
        "partial": "partial",
        "unavailable": "off",
        "skipped": "off",
        "no_deployment": "off",
        "error": "bad",
    }.get(status, "off")
    return f'<span class="pill {tone}">{_h(STATUS_LABEL.get(status, status))}</span>'


def _h(value: Any) -> str:
    if value is None:
        return "–"
    return html.escape(str(value), quote=True)
