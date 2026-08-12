"""Projekt-admin — massradera testkonton från backofficen.

Kör `scripts/db/cleanup-test-projects.mjs` via subprocess (samma mönster som
`pipeline_health.py`). Default är DRY-RUN; APPLY kräver att man bockar i
en check-box för att förhindra fingerfel.

Testkonton plockas från `.env.local`:
- `ADMIN_EMAILS` (kommaseparerad lista)
- `SUPERADMIN_EMAIL`
- `TEST_USER_EMAIL`
"""

from __future__ import annotations

import json
import re
import subprocess
import time
from datetime import datetime, timezone
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext, render_save_scope


_DEFAULT_TIMEOUT_S = 120
_SCRIPT_REL = "scripts/db/cleanup-test-projects.mjs"


def render(ctx: BackofficeContext) -> None:
    st.title("Projekt-admin · massradera testkonton")
    st.caption(
        "Kör `scripts/db/cleanup-test-projects.mjs` mot DB:n som `.env.local` pekar på. "
        "Default är DRY-RUN — apply kräver explicit bekräftelse."
    )
    render_save_scope(
        "prod",
        note="Dry-run läser bara. **Apply raderar rader i databasen** som "
        "`.env.local` pekar på — det går inte att ångra via **Återställning** "
        "(backup-lagret täcker filer, inte databasen).",
    )

    test_emails = _read_test_emails(ctx)
    target_db = _read_target_db(ctx)

    with st.expander("Konfiguration (från .env.local)", expanded=False):
        st.write("**Test/admin/superadmin-emails:**")
        if test_emails:
            for e in test_emails:
                st.code(e, language=None)
        else:
            st.warning(
                "Inga ADMIN_EMAILS / SUPERADMIN_EMAIL / TEST_USER_EMAIL hittades i `.env.local`."
            )
        st.write(f"**Target DB:** `{target_db or '(POSTGRES_URL saknas)'}`")

    st.divider()

    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        scope = st.radio(
            "Vilka konton?",
            options=("all_test_users", "specific_email", "specific_user_id"),
            format_func=lambda v: {
                "all_test_users": "Alla test/admin/superadmin",
                "specific_email": "Specifik email",
                "specific_user_id": "Specifik user_id",
            }[v],
            horizontal=False,
        )
    with col2:
        keep = st.number_input(
            "Behåll N senaste",
            min_value=0,
            max_value=200,
            value=4,
            step=1,
            help="Antal senaste projekt per användare som ALDRIG raderas.",
        )
    with col3:
        st.write("")  # spacer
        st.write("")  # spacer
        st.write(f"**Hittade konton:** {len(test_emails)}")

    specific_email = ""
    specific_user_id = ""
    if scope == "specific_email":
        specific_email = st.text_input(
            "Email",
            placeholder="user@example.com",
            help="Användarens email i `users.email`-tabellen (case-insensitive).",
        )
    elif scope == "specific_user_id":
        specific_user_id = st.text_input(
            "user_id",
            placeholder="user_abc123",
            help="Internt user_id (`users.id`). Kringgår email-uppslag.",
        )

    cmd = _build_command(scope, keep, specific_email, specific_user_id, apply_mode=False)
    scope_incomplete = cmd is None
    if scope_incomplete:
        # Fail-closed: inget kommando visas och båda knapparna är disabled —
        # tom specifik scope får aldrig breddas till --all-test-users.
        if scope == "specific_email":
            st.error("Ange en email innan du kör DRY-RUN/APPLY — tomt fält breddar inte till alla.")
        elif scope == "specific_user_id":
            st.error("Ange ett user_id innan du kör DRY-RUN/APPLY — tomt fält breddar inte till alla.")
        else:
            st.error("Ogiltigt scope — inget kommando byggs.")
    else:
        st.code(" ".join(cmd[1:]), language="bash")

    st.divider()

    col_dry, col_apply = st.columns(2)

    with col_dry:
        if st.button(
            "🔍 Kör DRY-RUN",
            type="secondary",
            use_container_width=True,
            disabled=scope_incomplete,
        ):
            # Belt-and-suspenders: never run a broadened command even if the
            # button somehow fires while scope is incomplete.
            if cmd is None:
                st.error("Kan inte köra DRY-RUN utan giltigt scope.")
            else:
                with st.spinner("Kör DRY-RUN…"):
                    result = _run_script(ctx, cmd)
                st.session_state["projects_admin_last_dry"] = result
                st.session_state.pop("projects_admin_apply_confirmed", None)

    with col_apply:
        confirm = st.checkbox(
            "Jag förstår att detta raderar rader permanent",
            key="projects_admin_apply_confirm_checkbox",
        )
        apply_disabled = (
            scope_incomplete
            or not confirm
            or "projects_admin_last_dry" not in st.session_state
        )
        if st.button(
            "🗑 KÖR APPLY",
            type="primary",
            use_container_width=True,
            disabled=apply_disabled,
            help=(
                "Aktiveras först efter en lyckad DRY-RUN och bekräftelse-checkbox. "
                "Använder samma argument som DRY-RUN-knappen visade."
            ),
        ):
            apply_cmd = _build_command(
                scope, keep, specific_email, specific_user_id, apply_mode=True
            )
            if apply_cmd is None:
                st.error("Kan inte köra APPLY utan giltigt scope — ingen radering utförd.")
            else:
                with st.spinner("Kör APPLY…"):
                    result = _run_script(ctx, apply_cmd)
                st.session_state["projects_admin_last_apply"] = result
                # Tvinga ny DRY-RUN-bekräftelse innan nästa apply.
                st.session_state.pop("projects_admin_last_dry", None)

    st.divider()

    dry = st.session_state.get("projects_admin_last_dry")
    apply_result = st.session_state.get("projects_admin_last_apply")

    if dry:
        _render_result("Senaste DRY-RUN", dry)
    if apply_result:
        _render_result("Senaste APPLY", apply_result)

    if not dry and not apply_result:
        st.info("Kör en DRY-RUN först för att se vad som skulle raderas.")


def _build_command(
    scope: str,
    keep: int,
    specific_email: str,
    specific_user_id: str,
    *,
    apply_mode: bool,
) -> list[str] | None:
    """Bygg argv för cleanup-scriptet.

    Fail-closed: när operatören valt specifik email/user_id men fältet är
    tomt returneras ``None`` — aldrig en tyst breddning till
    ``--all-test-users``. Okänt scope ger också ``None``.
    """
    cmd = ["node", _SCRIPT_REL, "--keep", str(int(keep))]
    if scope == "specific_email":
        email = specific_email.strip()
        if not email:
            return None
        cmd.extend(["--user", email])
    elif scope == "specific_user_id":
        user_id = specific_user_id.strip()
        if not user_id:
            return None
        cmd.extend(["--user-id", user_id])
    elif scope == "all_test_users":
        cmd.append("--all-test-users")
    else:
        return None
    if apply_mode:
        cmd.append("--apply")
    return cmd


def _run_script(ctx: BackofficeContext, command: list[str]) -> dict[str, Any]:
    started_iso = datetime.now(timezone.utc).isoformat()
    started = time.time()
    stdout = ""
    stderr = ""
    exit_code: int = -99
    try:
        proc = subprocess.run(
            command,
            cwd=str(ctx.repo_root),
            capture_output=True,
            text=True,
            timeout=_DEFAULT_TIMEOUT_S,
            check=False,
            shell=False,
        )
        exit_code = proc.returncode
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
    except subprocess.TimeoutExpired as exc:
        exit_code = -1
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = (
            (exc.stderr if isinstance(exc.stderr, str) else "")
            + f"\n[backoffice] Timed out efter {_DEFAULT_TIMEOUT_S}s"
        )
    except FileNotFoundError as exc:
        exit_code = -2
        stderr = f"Saknar binär ({command[0]}): {exc}"
    except Exception as exc:  # pragma: no cover
        exit_code = -3
        stderr = f"Oväntat fel: {exc}"

    elapsed = time.time() - started
    return {
        "command": " ".join(command),
        "exitCode": int(exit_code),
        "elapsedSec": round(elapsed, 2),
        "startedAt": started_iso,
        "finishedAt": datetime.now(timezone.utc).isoformat(),
        "stdout": stdout,
        "stderr": stderr,
        "summary": _extract_summary(stdout),
    }


def _extract_summary(stdout: str) -> dict[str, Any] | None:
    """Scriptet skriver en JSON-rad sist. Plocka ut den om den finns."""
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return None


def _render_result(title: str, result: dict[str, Any]) -> None:
    code = result.get("exitCode", -99)
    if code == 0:
        st.success(f"{title}: OK ({result.get('elapsedSec')}s)")
    else:
        st.error(f"{title}: FAIL exit={code} ({result.get('elapsedSec')}s)")

    st.code(result.get("command", ""), language="bash")

    summary = result.get("summary")
    if summary:
        per_user = summary.get("summary") or []
        if per_user:
            st.write("**Per användare:**")
            st.dataframe(per_user, use_container_width=True, hide_index=True)
        meta_cols = st.columns(3)
        meta_cols[0].metric("Mode", summary.get("mode") or "-")
        meta_cols[1].metric("Keep N", summary.get("keep") or 0)
        total_deleted = sum(int(row.get("deleted", 0)) for row in per_user)
        meta_cols[2].metric("Totalt raderat", total_deleted)

    with st.expander("stdout", expanded=False):
        st.code(result.get("stdout", "") or "(tom)", language="text")

    if result.get("stderr"):
        with st.expander("stderr", expanded=code != 0):
            st.code(result["stderr"], language="text")


def _read_env_local(ctx: BackofficeContext) -> dict[str, str]:
    """Enkel parser — vi behöver inte fullt stöd för escapes."""
    env_path = ctx.env_local
    if not env_path.is_file():
        return {}
    out: dict[str, str] = {}
    for raw_line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        sep = line.find("=")
        if sep == -1:
            continue
        key = line[:sep].strip()
        val = line[sep + 1 :].strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        out[key] = val
    return out


def _read_test_emails(ctx: BackofficeContext) -> list[str]:
    env = _read_env_local(ctx)
    raw = []
    raw.extend((env.get("ADMIN_EMAILS") or "").split(","))
    raw.append(env.get("SUPERADMIN_EMAIL") or "")
    raw.append(env.get("TEST_USER_EMAIL") or "")
    cleaned = []
    seen = set()
    for entry in raw:
        e = entry.strip().lower()
        if not e or e in seen:
            continue
        seen.add(e)
        cleaned.append(e)
    return cleaned


def _read_target_db(ctx: BackofficeContext) -> str:
    env = _read_env_local(ctx)
    url = env.get("POSTGRES_URL") or env.get("POSTGRES_URL_NON_POOLING") or env.get("DATABASE_URL")
    if not url:
        return ""
    # Maska lösenordet — visa bara host/db.
    masked = re.sub(r"://[^:]+:[^@]+@", "://***:***@", url)
    return masked
