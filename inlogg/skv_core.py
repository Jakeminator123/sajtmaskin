"""
Shared SKV automation primitives used by skv6 and skv_int7.
"""

from typing import Any, Dict, Optional, Tuple, List


FORM_NEXT_HOST_SELECTOR = "skv-button-10-0-7[button-type='primary'].flytt-skv-wizard-step-button"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in ("y", "yes", "1", "true")


def load_config(config_file: str) -> Dict[str, str]:
    """Load config from KEY=value lines. Values are normalized to lowercase."""
    out: Dict[str, str] = {}
    try:
        with open(config_file, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                out[key.strip().upper()] = (value.strip() or "").lower()
    except Exception:
        pass
    return out


def get_form_signals(p, next_selector: str = FORM_NEXT_HOST_SELECTOR) -> Dict[str, Any]:
    """Collect robust readiness signals from main/popup page."""
    if not p:
        return {
            "ok": False,
            "url": "",
            "url_has_flytt": False,
            "has_form": False,
            "has_wizard_step": False,
            "has_active_step": False,
            "has_next_host": False,
            "error": "no page",
        }

    try:
        url = p.url or ""
    except Exception:
        return {
            "ok": False,
            "url": "",
            "url_has_flytt": False,
            "has_form": False,
            "has_wizard_step": False,
            "has_active_step": False,
            "has_next_host": False,
            "error": "url unavailable",
        }

    url_has_flytt = "flytt" in url.lower()
    if not url_has_flytt:
        return {
            "ok": True,
            "url": url,
            "url_has_flytt": False,
            "has_form": False,
            "has_wizard_step": False,
            "has_active_step": False,
            "has_next_host": False,
            "error": "",
        }

    try:
        out = p.evaluate(
            """(nextSel) => {
                function qs(root, sel) {
                    try { const el = root.querySelector(sel); if (el) return el; } catch(e) {}
                    const nodes = root.querySelectorAll('*');
                    for (const n of nodes) {
                        if (n.shadowRoot) { const f = qs(n.shadowRoot, sel); if (f) return f; }
                    }
                    return null;
                }
                const hasForm = !!qs(document, '#fbfFlyttanmalanForm');
                const hasWizardStep = !!qs(document, 'flytt-skv-wizard-step');
                const hasActiveStep = !!qs(document, '.flytt-skv-wizard-step--active, .flytt-skv-wizard-step--check');
                const hasNextHost = !!qs(document, nextSel);
                return { hasForm, hasWizardStep, hasActiveStep, hasNextHost, title: document.title || '' };
            }""",
            next_selector,
        )
        return {
            "ok": True,
            "url": url,
            "url_has_flytt": url_has_flytt,
            "has_form": bool(out.get("hasForm")),
            "has_wizard_step": bool(out.get("hasWizardStep")),
            "has_active_step": bool(out.get("hasActiveStep")),
            "has_next_host": bool(out.get("hasNextHost")),
            "title": out.get("title", ""),
            "error": "",
        }
    except Exception as e:
        return {
            "ok": False,
            "url": url,
            "url_has_flytt": url_has_flytt,
            "has_form": False,
            "has_wizard_step": False,
            "has_active_step": False,
            "has_next_host": False,
            "error": str(e),
        }


def is_form_ready_from_signals(signals: Dict[str, Any], api_ready: bool) -> bool:
    if not signals or not signals.get("url_has_flytt"):
        return False
    if signals.get("has_form") and signals.get("has_wizard_step"):
        return bool(signals.get("has_active_step") or signals.get("has_next_host") or api_ready)
    if signals.get("has_next_host"):
        return True
    return False


def get_all_pages_for_form(page) -> List[Any]:
    try:
        ctx = page.context
        if ctx:
            return list(ctx.pages)
    except Exception:
        pass
    return []


def pick_form_page(
    page,
    popup_ref,
    api_ready: bool,
    all_pages: Optional[list] = None,
    next_selector: str = FORM_NEXT_HOST_SELECTOR,
) -> Tuple[Optional[Any], str, Dict[str, Any], Optional[Dict[str, Any]]]:
    """Pick ready page among main, popup, and other tabs."""
    pages_to_check = []
    if all_pages:
        pages_to_check = [(p, f"tab_{i}") for i, p in enumerate(all_pages) if p and not p.is_closed()]
    if not pages_to_check:
        pages_to_check = [(page, "main")]
        if popup_ref and not popup_ref.is_closed():
            pages_to_check.append((popup_ref, "popup"))

    main_signals = get_form_signals(page, next_selector)
    popup_signals = get_form_signals(popup_ref, next_selector) if popup_ref and not popup_ref.is_closed() else None

    for p, source in pages_to_check:
        try:
            sig = get_form_signals(p, next_selector)
            if is_form_ready_from_signals(sig, api_ready):
                return p, source, sig, main_signals
            if sig.get("url_has_flytt"):
                try:
                    if p.locator(next_selector).count() > 0:
                        return p, source, {**sig, "has_next_host": True}, main_signals
                    if p.get_by_role("button", name="Nästa").count() > 0:
                        return p, source, {**sig, "has_next_host": True}, main_signals
                except Exception:
                    pass
        except Exception:
            continue
    return None, "", main_signals, popup_signals
