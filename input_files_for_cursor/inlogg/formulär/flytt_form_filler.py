"""
flytt_form_filler.py - Auto-fill Skatteverket flyttanmälan form.

Approach: scan all known fields each round, fill whatever is visible,
click Nästa to advance, repeat. Not sequential - handles any wizard step.
"""
import os
import time
import json
import re
from typing import Callable, Optional, Dict

DEFAULT_MOCKUP_DATA = {
    "inflyttningsdatum": "2026-01-15",
    "gatuadress": "Storgatan 12",
    "postnummer": "11122",
    "postort": "Stockholm",
    "lagenhetsnummer": "1401",
    "fastighetsbeteckning": "Rudan mindre 10",
    "fastighetsagare": "egen",
    "telefonnummer": "0701234567",
    "email": "test@example.com",
}

FIELD_SELECTORS = {
    "inflyttningsdatum": "input[name='inflyttningsdatum']",
    "gatuadress": "input[name='gatuadress']",
    "postnummer": "input[name='postnummer']",
    "postort": "input[name='postort']",
    "lagenhetsnummer": "input[name='lagenhetsnummer']",
    "fastighetsbeteckning": "input[name='fastighetsbeteckning']",
    "fastighetsagare": "input[name='fastighetsagare']",
    "telefonnummer": "input[name='telefonnummer']",
    "email": "input[name='email']",
}

NEXT_BTN = "skv-button-10-0-7[button-type='primary'].flytt-skv-wizard-step-button"

# Confirmation checkbox that appears on address validation error
CONFIRM_CHECKBOX = "skv-selection-control-10-0-12[type='checkbox']"

POLL_INTERVAL = 1.0
WAIT_BETWEEN_FILLS = 0.5
WAIT_AFTER_NEXT = 2.0
MAX_ROUNDS = 30
MAX_IDLE_ROUNDS = 8

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(SCRIPT_DIR, "flytt_filler_log.txt")


def _normalize_payload(payload: Dict[str, str | None]) -> Dict[str, str]:
    def _clean_postal(v: str) -> str:
        return re.sub(r"\s+", "", v or "")

    def _clean_phone(v: str) -> str:
        return re.sub(r"[^\d+]", "", v or "")

    return {
        "inflyttningsdatum": (payload.get("inflyttningsdatum") or payload.get("moveDate") or "").strip(),
        "gatuadress": (payload.get("gatuadress") or payload.get("toStreet") or "").strip(),
        "postnummer": _clean_postal((payload.get("postnummer") or payload.get("toPostal") or "").strip()),
        "postort": (payload.get("postort") or payload.get("toCity") or "").strip(),
        "lagenhetsnummer": (payload.get("lagenhetsnummer") or payload.get("apartmentNumber") or "").strip(),
        "fastighetsbeteckning": (payload.get("fastighetsbeteckning") or payload.get("propertyDesignation") or "").strip(),
        "fastighetsagare": (payload.get("fastighetsagare") or payload.get("propertyOwner") or "").strip(),
        "telefonnummer": _clean_phone((payload.get("telefonnummer") or payload.get("phone") or "").strip()),
        "email": (payload.get("email") or "").strip(),
    }


def _load_runtime_payload(payload_path: str) -> Dict[str, str]:
    with open(payload_path, "r", encoding="utf-8") as f:
        raw = json.load(f) or {}
    if not isinstance(raw, dict):
        return {}
    return _normalize_payload({k: (str(v) if v is not None else "") for k, v in raw.items()})


def _resolve_field_data(
    form_data: Optional[Dict[str, str]],
    payload_path: Optional[str],
    allow_mockup_data: bool,
    log: Callable[[str], None],
) -> Dict[str, str]:
    if form_data:
        normalized = _normalize_payload(form_data)
        log("Using form filler data from provided runtime form_data.")
        return normalized

    if payload_path and os.path.isfile(payload_path):
        try:
            normalized = _load_runtime_payload(payload_path)
            log(f"Using form filler data from payload file: {payload_path}")
            return normalized
        except Exception as e:
            log(f"Failed reading payload file '{payload_path}': {e}")

    if allow_mockup_data:
        log("Using explicit fallback mockup data (SKV_ALLOW_MOCKUP_DATA).")
        return DEFAULT_MOCKUP_DATA.copy()

    log("No runtime payload available; skipping auto-fill (mock fallback disabled).")
    return {}


def run_flytt_form_filler(
    page,
    cancel_check: Callable[[], bool],
    log_callback: Optional[Callable[[str], None]] = None,
    form_data: Optional[Dict[str, str]] = None,
    payload_path: Optional[str] = None,
    allow_mockup_data: bool = False,
) -> None:
    def _default_log(msg: str) -> None:
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(msg + "\n")
        except Exception:
            pass

    def log(msg: str) -> None:
        fn = log_callback or _default_log
        fn(msg)

    # Only clear own log file when using default (no callback); else output goes to session log
    if log_callback is None:
        try:
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.write("")
        except Exception:
            pass

    data = _resolve_field_data(form_data, payload_path, allow_mockup_data, log)
    fillable_fields = {k for k, v in data.items() if (v or "").strip()}
    if not fillable_fields:
        log("No fillable fields resolved. Exiting filler.")
        return

    log("Flytt form filler started (scan-fill-advance mode)\n")

    # Scroll down once at start - first Nästa is often below viewport on intro step
    try:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(0.5)
    except Exception:
        pass

    filled = set()
    idle_rounds = 0
    first_next_gate_done = False

    for rnd in range(MAX_ROUNDS):
        if cancel_check():
            log("Cancelled.")
            return

        round_filled = 0

        for name, selector in FIELD_SELECTORS.items():
            if name not in fillable_fields:
                continue
            if name in filled:
                continue
            try:
                loc = page.locator(selector)
                if loc.count() > 0 and loc.first.is_visible():
                    value = data.get(name, "")
                    if not value:
                        continue
                    page.fill(selector, value)
                    filled.add(name)
                    round_filled += 1
                    log(f"OK: {name} = '{value}'")
                    time.sleep(WAIT_BETWEEN_FILLS)
            except Exception as e:
                log(f"FAIL: {name} - {e}")

        if round_filled > 0:
            idle_rounds = 0
            log(f"Round {rnd + 1}: filled {round_filled} field(s). Clicking Nästa...")
            time.sleep(WAIT_BETWEEN_FILLS)
            if not first_next_gate_done:
                _wait_for_first_next_ready(page, log)
                first_next_gate_done = True
            _try_check_confirm(page, log)
            _try_click_next(page, log)
            time.sleep(WAIT_AFTER_NEXT)
        else:
            idle_rounds += 1
            if idle_rounds <= 3:
                if not first_next_gate_done:
                    _wait_for_first_next_ready(page, log)
                    first_next_gate_done = True
                _try_check_confirm(page, log)
                _try_click_next(page, log)
                time.sleep(WAIT_AFTER_NEXT)
            elif idle_rounds >= MAX_IDLE_ROUNDS:
                log(f"No fields found for {MAX_IDLE_ROUNDS} rounds. Done.")
                break
            else:
                time.sleep(POLL_INTERVAL)

        if len(filled) >= len(fillable_fields):
            if not first_next_gate_done:
                _wait_for_first_next_ready(page, log)
                first_next_gate_done = True
            _try_click_next(page, log)
            log(f"\nAll {len(filled)} fields filled!")
            break

    log(f"\nFlytt form filler finished. Filled: {sorted(filled)}")


def _try_check_confirm(page, log) -> bool:
    """Check any visible confirmation checkbox (address validation etc.)."""
    try:
        loc = page.locator(CONFIRM_CHECKBOX)
        for i in range(loc.count()):
            el = loc.nth(i)
            if el.is_visible():
                checked = el.get_attribute("checked")
                if checked is None:
                    el.click(timeout=3000)
                    log("  -> Checked confirmation checkbox")
                    time.sleep(0.5)
                    return True
    except Exception as e:
        log(f"  -> Confirm checkbox failed: {e}")
    return False


def _wait_for_first_next_ready(page, log, timeout_seconds: float = 4.0) -> bool:
    """Short one-time gate before first Next click after readiness."""
    start = time.time()
    while (time.time() - start) < timeout_seconds:
        try:
            loc = page.locator(NEXT_BTN)
            if loc.count() > 0 and loc.first.is_visible():
                busy_attr = loc.first.get_attribute("busy")
                # busy attr is on host custom element; proceed when absent/false.
                if not busy_attr or str(busy_attr).lower() in ("false", "0", "no"):
                    log("  -> First Nästa gate ready")
                    return True
        except Exception:
            pass
        time.sleep(0.2)
    log("  -> First Nästa gate timeout, continue anyway")
    return False


def _try_click_next(page, log) -> bool:
    try:
        loc = page.locator(NEXT_BTN)
        if loc.count() > 0 and loc.first.is_visible():
            loc.first.scroll_into_view_if_needed()
            time.sleep(0.3)
            loc.first.click(timeout=5000)
            log("  -> Clicked Nästa")
            return True
    except Exception as e:
        log(f"  -> Nästa failed: {e}")
    return False
