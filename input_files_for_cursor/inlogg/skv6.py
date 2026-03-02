"""
skv6.py - Flyttanmälan Auto

Click sequences → QR login → auto-fill form → save HTML snapshot.
Single session log file (overwrites previous). POPUP_BROWSER_NORMAL_WINDOW
opens form URL in default browser when form is found.
"""
import base64
import json
import os
import re
import time
import uuid
import threading
import webbrowser
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any
from urllib.parse import urljoin

import requests
from flask import Flask, request, jsonify, render_template_string, send_from_directory, Response

# Playwright (sync)
from playwright.sync_api import sync_playwright
from skv_core import (
    FORM_NEXT_HOST_SELECTOR,
    USER_AGENT,
    is_truthy,
    load_config,
    get_form_signals,
    is_form_ready_from_signals,
    get_all_pages_for_form,
    pick_form_page,
)


APP_HOST = os.environ.get("SKV_HOST", "127.0.0.1")
APP_PORT = int(os.environ.get("PORT", "8767"))
SKV_API_KEY = os.environ.get("SKV_API_KEY", "").strip()

def _resolve_headless() -> bool:
    explicit = os.environ.get("SKV_HEADLESS", "").strip().lower()
    if explicit:
        return is_truthy(explicit)
    return not bool(os.environ.get("DISPLAY"))
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESULT_DIR = os.path.join(SCRIPT_DIR, "results")
os.makedirs(RESULT_DIR, exist_ok=True)
RUNTIME_DIR = os.path.join(SCRIPT_DIR, "runtime")
os.makedirs(RUNTIME_DIR, exist_ok=True)

# Single session log - one file per run, overwrites previous session
SESSION_LOG_FILE = os.path.join(SCRIPT_DIR, "skv6_session_log.txt")

CONFIG_FILE = os.path.join(SCRIPT_DIR, "config.txt")
DEFAULT_PAYLOAD_FILE = os.path.join(RUNTIME_DIR, "skv_payload_latest.json")


def _load_config() -> Dict[str, str]:
    """Load config from config.txt. Returns dict of KEY=value (lowercased values)."""
    return load_config(CONFIG_FILE)


def _get_form_signals(p) -> Dict[str, Any]:
    return get_form_signals(p, FORM_NEXT_HOST_SELECTOR)


def _is_form_ready_from_signals(signals: Dict[str, Any], api_ready: bool) -> bool:
    """Readiness decision after QR: require real form signals, with API fallback."""
    return is_form_ready_from_signals(signals, api_ready)


def _get_all_pages_for_form(page) -> list:
    """Collect all pages in page's context - includes all tabs in same window."""
    return get_all_pages_for_form(page)


def _pick_form_page(page, popup_ref, api_ready: bool, all_pages: Optional[list] = None):
    """Pick ready page among main, popup, and any other tabs (new tab often opens after BankID approval)."""
    return pick_form_page(
        page=page,
        popup_ref=popup_ref,
        api_ready=api_ready,
        all_pages=all_pages,
        next_selector=FORM_NEXT_HOST_SELECTOR,
    )

app = Flask(__name__)


@app.before_request
def _check_api_key():
    if not SKV_API_KEY:
        return
    if request.path == "/api/health":
        return
    if request.path.startswith("/api/"):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if token != SKV_API_KEY:
            return jsonify({"ok": False, "error": "Unauthorized"}), 401


@app.get("/api/health")
def api_health():
    return jsonify({"ok": True, "service": "skv-playwright", "headless": _resolve_headless()})


@app.after_request
def _add_cors_headers(response):
    """Allow cross-origin requests from the Next.js dev server."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


# ----------------------------
# Job handling (simple in-memory)
# ----------------------------

@dataclass
class JobStatus:
    job_id: str
    state: str            # queued | running | matched | timeout | error | cancelled
    message: str = ""
    started_at: Optional[float] = None
    ended_at: Optional[float] = None
    screenshot_path: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


_jobs: Dict[str, JobStatus] = {}
_cancel_flags: Dict[str, bool] = {}
_jobs_lock = threading.Lock()

JOB_CLEANUP_DELAY_SECONDS = 300
MAX_CONCURRENT_JOBS = 3
MAX_JOB_RUNTIME_SECONDS = 600


def _set_job(job: JobStatus) -> None:
    with _jobs_lock:
        _jobs[job.job_id] = job


def _get_job(job_id: str) -> Optional[JobStatus]:
    with _jobs_lock:
        return _jobs.get(job_id)


def _cancel_job(job_id: str) -> bool:
    with _jobs_lock:
        if job_id in _jobs:
            _cancel_flags[job_id] = True
            return True
    return False


def _is_cancelled(job_id: str) -> bool:
    with _jobs_lock:
        return _cancel_flags.get(job_id, False)


def _schedule_job_cleanup(job_id: str) -> None:
    """Remove finished job data from memory after a delay to allow final state polling."""
    def _cleanup():
        time.sleep(JOB_CLEANUP_DELAY_SECONDS)
        with _jobs_lock:
            _jobs.pop(job_id, None)
            _cancel_flags.pop(job_id, None)
        with _log_lock:
            _qr_captured.pop(job_id, None)
            _qr_capture_last_time.pop(job_id, None)
        try:
            pf = os.path.join(RUNTIME_DIR, f"payload_{job_id}.json")
            if os.path.isfile(pf):
                os.remove(pf)
        except Exception:
            pass

    threading.Thread(target=_cleanup, daemon=True, name=f"cleanup-{job_id}").start()


def _count_active_jobs() -> int:
    with _jobs_lock:
        return sum(1 for j in _jobs.values() if j.state in ("queued", "running"))


# ----------------------------
# QR/BankID network logging
# ----------------------------

_log_lock = threading.Lock()

# Store captured BankID tokens per job (aid, autostart_token) for opening in new tab
_qr_captured: Dict[str, dict] = {}


def _log_session(msg: str, section: str = "", data: Optional[dict] = None) -> None:
    """Append to single session log file. Structured with timestamps and optional section."""
    try:
        with _log_lock:
            ts = datetime.now().strftime("%H:%M:%S")
            with open(SESSION_LOG_FILE, "a", encoding="utf-8") as f:
                if section:
                    f.write(f"\n[{ts}] [{section}] {msg}\n")
                else:
                    f.write(f"[{ts}] {msg}\n")
                if data:
                    f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"Session log error: {e}")


def _clear_session_log(job_id: str = "") -> None:
    """Clear and init log file at start of new session - overwrites previous."""
    try:
        with _log_lock:
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with open(SESSION_LOG_FILE, "w", encoding="utf-8") as f:
                f.write("=" * 60 + "\n")
                f.write(f"  FLYTTANMÄLAN SESSION  |  {ts}  |  job: {job_id}\n")
                f.write("=" * 60 + "\n\n")
    except Exception as e:
        print(f"Session log clear error: {e}")


def _log_qr_data(label: str, data: str | dict) -> None:
    """Append QR/BankID-related data to session log."""
    payload = data if isinstance(data, dict) else {"msg": str(data)}
    _log_session(label, "QR/AUTH", payload)


QR_PROXY_BASE_URL = "https://auth.funktionstjanster.se/id/bankid/qr?aid="

_qr_capture_last_time: Dict[str, float] = {}
QR_CAPTURE_INTERVAL_SECONDS = 2.0


def _capture_qr_from_playwright_page(target_page, job_id: str) -> bool:
    """
    Capture QR code from a Playwright page (auth SPA) and store in _qr_captured.
    Tries: canvas, img with qr-like attributes, then viewport screenshot.
    Returns True if capture succeeded.
    """
    if target_page is None:
        return False
    try:
        if target_page.is_closed():
            return False
    except Exception:
        return False

    try:
        selectors_to_try = [
            "canvas",
            "img[alt*='QR'], img[alt*='qr'], img[data-qr]",
            "[class*='qr'][class*='code'], [class*='qrcode']",
            "svg",
        ]
        screenshot_bytes = None

        for sel in selectors_to_try:
            try:
                loc = target_page.locator(sel).first
                if not loc.is_visible(timeout=500):
                    continue
                box = loc.bounding_box()
                if not box or box.get("width", 0) < 50 or box.get("height", 0) < 50:
                    continue
                screenshot_bytes = loc.screenshot(type="png", timeout=3000)
                if screenshot_bytes and len(screenshot_bytes) > 100:
                    break
            except Exception:
                continue

        if not screenshot_bytes or len(screenshot_bytes) < 100:
            try:
                screenshot_bytes = target_page.screenshot(type="png", timeout=3000)
            except Exception:
                pass

        if screenshot_bytes and len(screenshot_bytes) > 100:
            b64 = base64.b64encode(screenshot_bytes).decode("ascii")
            with _log_lock:
                if job_id not in _qr_captured:
                    _qr_captured[job_id] = {}
                _qr_captured[job_id]["qr_image_base64"] = b64
                _qr_captured[job_id]["qr_image_updated_at"] = time.time()
            return True
    except Exception as e:
        _log_qr_data("QR_CAPTURE_ERROR", {"job_id": job_id, "error": str(e)})
    return False


def _is_clone_qr_to_site_enabled() -> bool:
    """Feature gate for experimental QR mirroring endpoint."""
    cfg = _load_config()
    return is_truthy(os.environ.get("SKV_CLONE_QR_FROMPLAYWRIGHT_TO_SITE", "")) or is_truthy(
        cfg.get("CLONE_QR_FROMPLAYWRIGHT_TO_SITE", "")
    )


def _get_clone_qr_context(job_id: str) -> Dict[str, Any]:
    """Return best-effort QR clone context for a given running job."""
    with _log_lock:
        cap = dict(_qr_captured.get(job_id, {}))

    aid = str(cap.get("aid") or "").strip()
    qr_url = f"{QR_PROXY_BASE_URL}{aid}" if aid else ""

    return {
        "aid": aid,
        "qr_url": qr_url,
        "qr_image_ready": bool(cap.get("qr_image_base64")),
        "auth_spa_url": cap.get("auth_spa_url"),
        "api_ready": bool(cap.get("flytt_api_ready")),
        "api_last_url": cap.get("flytt_api_last_url"),
    }


def _resolve_browser_trace_config() -> tuple[bool, float]:
    """
    Resolve browser window tracing behavior.

    Enable with:
      - env: SKV_TRACE_BROWSER_WINDOWS=y
      - config.txt: TRACE_BROWSER_WINDOWS=y
    Optional interval (seconds):
      - env: SKV_TRACE_BROWSER_WINDOWS_INTERVAL=2
      - config.txt: TRACE_BROWSER_WINDOWS_INTERVAL=2
    """
    cfg = _load_config()
    enabled = is_truthy(os.environ.get("SKV_TRACE_BROWSER_WINDOWS", "")) or is_truthy(
        cfg.get("TRACE_BROWSER_WINDOWS", "")
    )
    interval_raw = (
        os.environ.get("SKV_TRACE_BROWSER_WINDOWS_INTERVAL", "").strip()
        or cfg.get("TRACE_BROWSER_WINDOWS_INTERVAL", "").strip()
    )
    interval_seconds = 5.0
    if interval_raw:
        try:
            parsed = float(interval_raw)
            if parsed > 0:
                interval_seconds = parsed
        except Exception:
            pass
    return enabled, interval_seconds


def _resolve_post_auth_scroll_config() -> tuple[bool, float, str]:
    """
    Resolve post-auth auto-scroll behavior based on loader visibility transitions.

    Enable with:
      - env: SKV_POST_AUTH_SCROLL_ON_LOADER_HIDDEN=y
      - config.txt: POST_AUTH_SCROLL_ON_LOADER_HIDDEN=y

    Delay after loader disappears:
      - env: SKV_POST_AUTH_SCROLL_DELAY_SECONDS=2
      - config.txt: POST_AUTH_SCROLL_DELAY_SECONDS=2

    Loader selector:
      - env: SKV_POST_AUTH_LOADER_SELECTOR=#loader
      - config.txt: POST_AUTH_LOADER_SELECTOR=#loader
    """
    cfg = _load_config()

    enabled_raw = (
        os.environ.get("SKV_POST_AUTH_SCROLL_ON_LOADER_HIDDEN", "").strip()
        or cfg.get("POST_AUTH_SCROLL_ON_LOADER_HIDDEN", "y").strip()
    )
    enabled = is_truthy(enabled_raw)

    delay_raw = (
        os.environ.get("SKV_POST_AUTH_SCROLL_DELAY_SECONDS", "").strip()
        or cfg.get("POST_AUTH_SCROLL_DELAY_SECONDS", "2").strip()
    )
    delay_seconds = 2.0
    if delay_raw:
        try:
            parsed = float(delay_raw)
            if parsed >= 0:
                delay_seconds = parsed
        except Exception:
            pass

    loader_selector = (
        os.environ.get("SKV_POST_AUTH_LOADER_SELECTOR", "").strip()
        or cfg.get("POST_AUTH_LOADER_SELECTOR", "#loader").strip()
        or "#loader"
    )

    return enabled, delay_seconds, loader_selector


def _read_loader_state(target_page, loader_selector: str) -> Dict[str, Any]:
    """
    Read loader existence/visibility from a page.
    Traverses shadow roots to make this resilient to web components.
    """
    out: Dict[str, Any] = {"ok": False, "exists": False, "visible": False, "selector": loader_selector}

    try:
        if target_page is None or target_page.is_closed():
            return out
    except Exception:
        return out

    try:
        result = target_page.evaluate(
            """(selector) => {
                function queryDeep(root, sel) {
                    try {
                        const direct = root.querySelector(sel);
                        if (direct) return direct;
                    } catch (e) {}
                    const nodes = root.querySelectorAll("*");
                    for (const node of nodes) {
                        if (node.shadowRoot) {
                            const found = queryDeep(node.shadowRoot, sel);
                            if (found) return found;
                        }
                    }
                    return null;
                }

                function isVisible(el) {
                    if (!el) return false;
                    const style = window.getComputedStyle(el);
                    if (!style) return false;
                    if (style.display === "none" || style.visibility === "hidden") return false;
                    if (Number(style.opacity || "1") <= 0) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }

                const el = queryDeep(document, selector);
                const exists = !!el;
                const visible = exists ? isVisible(el) : false;
                return { exists, visible };
            }""",
            loader_selector,
        )
        out["ok"] = True
        out["exists"] = bool(result.get("exists"))
        out["visible"] = bool(result.get("visible"))
        return out
    except Exception as e:
        out["error"] = str(e)
        return out


def _scroll_page_to_bottom(target_page) -> Dict[str, Any]:
    """Scroll page to bottom and return resulting scroll metrics."""
    return target_page.evaluate(
        """() => {
            const maxY = Math.max(
                document.body?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0
            );
            window.scrollTo(0, maxY);
            return {
                scrollY: window.scrollY || 0,
                maxY
            };
        }"""
    )


def _snapshot_browser_page(target_page, index: int, include_focus: bool = False) -> dict:
    """Collect robust page/tab diagnostics for session log."""
    snap: Dict[str, Any] = {"index": index, "closed": False}
    try:
        snap["closed"] = bool(target_page.is_closed())
    except Exception as e:
        snap["closed"] = True
        snap["closed_error"] = str(e)
        return snap

    if snap["closed"]:
        return snap

    try:
        snap["url"] = target_page.url
    except Exception as e:
        snap["url_error"] = str(e)

    try:
        title = target_page.title() or ""
        snap["title"] = title[:140]
    except Exception as e:
        snap["title_error"] = str(e)

    if include_focus:
        try:
            focus = target_page.evaluate(
                """() => ({
                    hasFocus: !!document.hasFocus(),
                    visibilityState: document.visibilityState || "",
                    readyState: document.readyState || ""
                })"""
            )
            snap["has_focus"] = bool(focus.get("hasFocus"))
            snap["visibility"] = focus.get("visibilityState")
            snap["ready_state"] = focus.get("readyState")
        except Exception as e:
            snap["focus_error"] = str(e)

    return snap


def _log_browser_windows(context, label: str, include_focus: bool = False) -> None:
    """Log all open tabs/pages for current browser context."""
    try:
        pages = list(context.pages) if context else []
    except Exception as e:
        _log_session(f"{label} (failed to enumerate pages)", "BROWSER", {"error": str(e)})
        return

    snapshot = []
    for idx, p in enumerate(pages):
        snapshot.append(_snapshot_browser_page(p, idx, include_focus=include_focus))

    _log_session(label, "BROWSER", {"page_count": len(snapshot), "pages": snapshot})


def _attach_page_debug_hooks(target_page, label: str) -> None:
    """Attach page lifecycle hooks to help diagnose window/tab behavior."""

    def _safe_url() -> str:
        try:
            return target_page.url
        except Exception:
            return ""

    def _log_evt(event: str, data: Optional[dict] = None) -> None:
        payload = {"label": label, "url": _safe_url()}
        if data:
            payload.update(data)
        _log_session(event, "BROWSER", payload)

    try:
        target_page.on("domcontentloaded", lambda: _log_evt("PAGE_DOMCONTENTLOADED"))
    except Exception:
        pass

    try:
        target_page.on("load", lambda: _log_evt("PAGE_LOAD"))
    except Exception:
        pass

    try:
        target_page.on("close", lambda: _log_evt("PAGE_CLOSED"))
    except Exception:
        pass

    try:
        def _on_frame_navigated(frame) -> None:
            try:
                if frame != target_page.main_frame:
                    return
            except Exception:
                pass
            _log_evt("PAGE_MAIN_FRAME_NAVIGATED", {"frame_url": getattr(frame, "url", "")})

        target_page.on("framenavigated", _on_frame_navigated)
    except Exception:
        pass


# ----------------------------
# Proxy: strip X-Frame-Options for iframe embedding
# ----------------------------

def _strip_frame_restrictions(csp: str) -> str:
    """Remove or relax frame-ancestors from CSP so iframe can embed."""
    if not csp:
        return ""
    parts = []
    for part in csp.split(";"):
        part = part.strip()
        if part.lower().startswith("frame-ancestors"):
            continue
        if part:
            parts.append(part)
    return "; ".join(parts)


def _inject_base_tag(html: str, base_url: str) -> str:
    """Inject <base href="..."> so relative URLs resolve correctly when served from proxy."""
    base_href = urljoin(base_url + "/" if not base_url.endswith("/") else base_url, ".")
    base_tag = f'<base href="{base_href}">'
    if re.search(r"<head[^>]*>", html, re.I):
        html = re.sub(r"(<head[^>]*>)", r"\1\n  " + base_tag, html, count=1, flags=re.I)
    else:
        html = base_tag + "\n" + html
    return html


@app.get("/proxy")
def proxy_route():
    target = request.args.get("url", "").strip()
    if not target or not target.startswith(("http://", "https://")):
        return "Invalid or missing url parameter", 400

    try:
        resp = requests.get(
            target,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.9"},
            allow_redirects=True,
            timeout=30,
            stream=True,
        )
    except requests.RequestException as e:
        return f"Proxy error: {e}", 502

    excluded_headers = [
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "x-content-type-options",
    ]

    def generate():
        content_type = resp.headers.get("content-type", "")
        is_html = "text/html" in content_type

        if is_html:
            body = b""
            for chunk in resp.iter_content(chunk_size=8192):
                body += chunk
            try:
                text = body.decode("utf-8", errors="replace")
                text = _inject_base_tag(text, resp.url)
                yield text.encode("utf-8")
            except Exception:
                yield body
        else:
            for chunk in resp.iter_content(chunk_size=8192):
                yield chunk

    headers = {}
    csp = resp.headers.get("Content-Security-Policy") or resp.headers.get("content-security-policy")
    for k, v in resp.headers.items():
        kl = k.lower()
        if kl in excluded_headers:
            if kl == "content-security-policy" and v:
                relaxed = _strip_frame_restrictions(v)
                if relaxed:
                    headers["Content-Security-Policy"] = relaxed
            continue
        if kl not in ("transfer-encoding", "content-encoding"):
            headers[k] = v

    return Response(
        generate(),
        status=resp.status_code,
        headers=headers,
        content_type=resp.headers.get("Content-Type", "text/html; charset=utf-8"),
    )


# ----------------------------
# Core: Fill Watch job
# ----------------------------

def _run_playwright_job(
    job_id: str,
    url: str,
    timeout_seconds: float,
    click_after_seconds_0: Optional[float] = None,
    click_selectors_0: Optional[list[str]] = None,
    click_after_seconds: Optional[float] = None,
    click_selectors: Optional[list[str]] = None,
    click_after_seconds_2: Optional[float] = None,
    click_selectors_2: Optional[list[str]] = None,
    click_after_seconds_3: Optional[float] = None,
    click_selectors_3: Optional[list[str]] = None,
    payload_file: Optional[str] = None,
) -> None:
    job = _get_job(job_id)
    if not job:
        return

    job.state = "running"
    job.started_at = time.time()
    job.message = "Startar webbläsare..."
    _set_job(job)

    # New session: clear previous logs and captured data
    _clear_session_log(job_id)
    with _log_lock:
        _qr_captured.pop(job_id, None)
        _qr_capture_last_time.pop(job_id, None)

    screenshot_file = os.path.join(RESULT_DIR, f"{job_id}.png")

    try:
        with sync_playwright() as p:
            chromium_args = [
                "--disable-features=LocalNetworkAccessChecks",
            ]
            if _resolve_headless():
                chromium_args += [
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--no-sandbox",
                    "--single-process",
                    "--disable-setuid-sandbox",
                    "--disable-extensions",
                ]
            browser = p.chromium.launch(headless=_resolve_headless(), args=chromium_args)
            page = browser.new_page()
            context = page.context
            trace_browser_windows, trace_interval_seconds = _resolve_browser_trace_config()
            last_trace_ts = 0.0
            (
                post_auth_scroll_enabled,
                post_auth_scroll_delay_seconds,
                post_auth_loader_selector,
            ) = _resolve_post_auth_scroll_config()

            page_seq = 0
            page_labels: Dict[int, str] = {}

            def _page_label(target_page) -> str:
                nonlocal page_seq
                key = id(target_page)
                if key not in page_labels:
                    page_seq += 1
                    page_labels[key] = f"page-{page_seq}"
                return page_labels[key]

            main_label = _page_label(page)
            _attach_page_debug_hooks(page, main_label)

            _log_session(
                "Browser trace config",
                "BROWSER",
                {
                    "trace_windows": trace_browser_windows,
                    "trace_interval_seconds": trace_interval_seconds,
                    "post_auth_scroll_enabled": post_auth_scroll_enabled,
                    "post_auth_scroll_delay_seconds": post_auth_scroll_delay_seconds,
                    "post_auth_loader_selector": post_auth_loader_selector,
                },
            )
            _log_browser_windows(context, "Initial browser pages", include_focus=True)

            def on_new_page(new_page):
                label = _page_label(new_page)
                _attach_page_debug_hooks(new_page, label)
                _log_session("NEW_PAGE_OPENED", "BROWSER", {"label": label, "url": new_page.url})
                _log_browser_windows(context, "After NEW_PAGE_OPENED", include_focus=True)

            context.on("page", on_new_page)

            # Log QR/BankID-related network traffic; capture autostart token for "clone" tab
            def on_response(response):
                try:
                    resp_url = response.url
                    keywords = ("bankid", "auth", "status", "poll", "collect", "sign", "qr", "session")
                    if any(k in resp_url.lower() for k in keywords) or "api" in resp_url.lower():
                        ct = response.headers.get("content-type", "")
                        if "json" in ct:
                            try:
                                body = response.json()
                                _log_qr_data("RESPONSE", {"url": resp_url, "status": response.status, "body": body})
                            except Exception:
                                pass
                        else:
                            _log_qr_data("RESPONSE", {"url": resp_url, "status": response.status})

                        # Logged-in API signal: secure flytt endpoints become available after QR auth.
                        if "/secure/folkbokforing/flyttanmalan/" in resp_url.lower() and response.status == 200:
                            first_seen = False
                            with _log_lock:
                                if job_id not in _qr_captured:
                                    _qr_captured[job_id] = {}
                                if not _qr_captured[job_id].get("flytt_api_ready"):
                                    first_seen = True
                                _qr_captured[job_id]["flytt_api_ready"] = True
                                _qr_captured[job_id]["flytt_api_last_url"] = resp_url
                            if first_seen:
                                _log_qr_data("FORM_API_READY", {"url": resp_url, "status": response.status})

                        # Capture aid and full auth page URL (not /qr - that gives EM_MISSING_AUTH_ATTEMPT when opened directly)
                        if "aid=" in resp_url:
                            m = re.search(r"aid=([^&]+)", resp_url)
                            if m:
                                aid = m.group(1)
                                qr_page = f"https://auth.funktionstjanster.se/id/bankid/qr?aid={aid}"
                                with _log_lock:
                                    if job_id not in _qr_captured:
                                        _qr_captured[job_id] = {}
                                    _qr_captured[job_id]["aid"] = aid
                                    _qr_captured[job_id]["qr_page_url"] = qr_page
                                # Full auth SPA URL - capture from /web/app/ HTML page (has aid; exclude images)
                                if "/web/app/" in resp_url and "aid=" in resp_url and not any(x in resp_url.lower() for x in [".svg", ".png", ".jpg", ".ico"]):
                                    with _log_lock:
                                        _qr_captured[job_id]["auth_spa_url"] = resp_url

                        if "getautostarttoken" in resp_url.lower() and response.status == 200:
                            try:
                                body_text = response.text()
                                if body_text and len(body_text) < 500:
                                    aid = _qr_captured.get(job_id, {}).get("aid", "")
                                    if "aid=" in resp_url:
                                        m = re.search(r"aid=([^&]+)", resp_url)
                                        if m:
                                            aid = m.group(1)
                                    token = body_text.strip().strip('"')
                                    bankid_url = f"bankid:///?autostarttoken={token}&redirect=null"
                                    with _log_lock:
                                        if job_id not in _qr_captured:
                                            _qr_captured[job_id] = {}
                                        _qr_captured[job_id].update({
                                            "autostart_token": token,
                                            "bankid_url": bankid_url,
                                        })
                                    _log_qr_data("AUTOSTART_TOKEN_CAPTURED", {"aid": aid, "token": token[:20] + "...", "bankid_url": bankid_url})
                            except Exception:
                                pass
                except Exception:
                    pass

            context.on("response", on_response)

            job.message = f"Navigerar till: {url}"
            _set_job(job)
            _log_session(f"Navigate to {url}", "INIT")
            page.goto(url, wait_until="domcontentloaded")
            _log_browser_windows(context, "After initial navigation", include_focus=True)

            # ---- Click sequences 0-3 ----

            _log_session("Click sequences starting", "CLICKS")
            # Click sequence 0 (cookie banner)
            if click_after_seconds_0 and click_selectors_0:
                job.message = f"Klicksekvens 0 (cookie): väntar {click_after_seconds_0}s..."
                _set_job(job)
                time.sleep(click_after_seconds_0)
                if _is_cancelled(job_id):
                    job.state = "cancelled"
                    job.ended_at = time.time()
                    job.message = "Avbruten av användaren."
                    _set_job(job)
                    browser.close()
                    return
                clicked0 = False
                for sel in click_selectors_0:
                    sel = (sel or "").strip()
                    if not sel:
                        continue
                    try:
                        page.click(sel, timeout=3000)
                        if job.details and job.details.get("click_errors_0"):
                            job.details["click_warnings_nonblocking_0"] = job.details.get("click_errors_0", [])
                            job.details["click_errors_0"] = []
                            job.message = "Klickade på cookie-banner (fortsatte efter fallback-selector)."
                        else:
                            job.message = "Klickade på cookie-banner."
                        clicked0 = True
                        _set_job(job)
                        break
                    except Exception as e:
                        job.details = job.details or {}
                        job.details["click_errors_0"] = job.details.get("click_errors_0", []) + [f"{sel}: {e}"]
                        job.message = f"Cookie: misslyckades med {sel[:30]}..., provar nästa..."
                        _set_job(job)
                if not clicked0:
                    job.message = "Cookie-banner: ingen selector fungerade (kanske ingen banner). Fortsätter..."

            # Click sequence 1
            if click_after_seconds and click_selectors:
                job.message = f"Väntar {click_after_seconds}s, sedan klick på element..."
                _set_job(job)
                time.sleep(click_after_seconds)
                if _is_cancelled(job_id):
                    job.state = "cancelled"
                    job.ended_at = time.time()
                    job.message = "Avbruten av användaren."
                    _set_job(job)
                    browser.close()
                    return
                clicked = False
                for sel in click_selectors:
                    sel = (sel or "").strip()
                    if not sel:
                        continue
                    try:
                        page.click(sel, timeout=5000)
                        if job.details and job.details.get("click_errors"):
                            job.details["click_warnings_nonblocking_1"] = job.details.get("click_errors", [])
                            job.details["click_errors"] = []
                            job.message = f"Klickade på {sel}. Fortsatte efter fallback-selector i sekvens 1."
                        else:
                            job.message = f"Klickade på {sel}. Väntar på nästa steg..."
                        clicked = True
                        _set_job(job)
                        break
                    except Exception as e:
                        job.details = job.details or {}
                        job.details["click_errors"] = job.details.get("click_errors", []) + [f"{sel}: {e}"]
                        job.message = f"Misslyckades med {sel}, provar nästa..."
                        _set_job(job)
                if not clicked:
                    job.message = "Ingen klick-selector fungerade. Fortsätter bevaka fältet..."

            # Click sequence 2
            if click_after_seconds_2 and click_selectors_2:
                job.message = f"Klicksekvens 2: väntar {click_after_seconds_2}s..."
                _set_job(job)
                time.sleep(click_after_seconds_2)
                if _is_cancelled(job_id):
                    job.state = "cancelled"
                    job.ended_at = time.time()
                    job.message = "Avbruten av användaren."
                    _set_job(job)
                    browser.close()
                    return
                clicked2 = False
                for sel in click_selectors_2:
                    sel = (sel or "").strip()
                    if not sel:
                        continue
                    try:
                        page.click(sel, timeout=5000)
                        if job.details and job.details.get("click_errors_2"):
                            job.details["click_warnings_nonblocking_2"] = job.details.get("click_errors_2", [])
                            job.details["click_errors_2"] = []
                            job.message = f"Klickade på {sel} (sekvens 2). Fortsatte efter fallback-selector."
                        else:
                            job.message = f"Klickade på {sel} (sekvens 2). Väntar på nästa steg..."
                        clicked2 = True
                        _set_job(job)
                        break
                    except Exception as e:
                        job.details = job.details or {}
                        job.details["click_errors_2"] = job.details.get("click_errors_2", []) + [f"{sel}: {e}"]
                        job.message = f"Sekvens 2: misslyckades med {sel}, provar nästa..."
                        _set_job(job)
                if not clicked2:
                    job.message = "Klicksekvens 2: ingen selector fungerade. Fortsätter bevaka fältet..."

            # Click sequence 3 (QR code - opens in new tab)
            popup_page_ref = None
            if click_after_seconds_3 and click_selectors_3:
                job.message = f"Klicksekvens 3: väntar {click_after_seconds_3}s (QR-kod)..."
                _set_job(job)
                time.sleep(click_after_seconds_3)
                if _is_cancelled(job_id):
                    job.state = "cancelled"
                    job.ended_at = time.time()
                    job.message = "Avbruten av användaren."
                    _set_job(job)
                    browser.close()
                    return
                clicked3 = False
                for sel in click_selectors_3:
                    sel = (sel or "").strip()
                    if not sel:
                        continue
                    try:
                        try:
                            qr_info = page.evaluate("""() => {
                                const links = Array.from(document.querySelectorAll('a[href*="bankid"], a[href*="redirect"], [data-qr-url], [data-autostart]'));
                                return links.map(el => ({
                                    href: el.href || el.getAttribute('href'),
                                    'data-qr-url': el.getAttribute('data-qr-url'),
                                    'data-autostart': el.getAttribute('data-autostart'),
                                    text: (el.textContent || '').slice(0, 100)
                                })).filter(x => x.href || x['data-qr-url'] || x['data-autostart']);
                            }""")
                            if qr_info:
                                _log_qr_data("QR_URL_FROM_PAGE", qr_info)
                        except Exception:
                            pass

                        got_popup = False
                        try:
                            with page.context.expect_page(timeout=3000) as popup_info:
                                page.click(sel, timeout=5000)
                            popup_page = popup_info.value
                            got_popup = True
                            popup_page_ref = popup_page
                            _log_qr_data("QR_NEW_TAB_URL", {"url": popup_page.url})
                        except Exception:
                            pass

                        if job.details and job.details.get("click_errors_3"):
                            job.details["click_warnings_nonblocking_3"] = job.details.get("click_errors_3", [])
                            job.details["click_errors_3"] = []
                            job.message = f"Klickade på {sel} (sekvens 3, QR). Fortsatte efter fallback-selector."
                        else:
                            job.message = f"Klickade på {sel} (sekvens 3, QR)."
                        clicked3 = True
                        _log_qr_data("QR_CLICK", {"selector": sel, "job_id": job_id})
                        _set_job(job)

                        bankid_url = None
                        with _log_lock:
                            cap = _qr_captured.get(job_id, {})
                        bankid_url = cap.get("bankid_url")

                        # Clone tab fallback: when QR click doesn't open a popup,
                        # we open a clone to the auth URL so the user can see and scan the QR code.
                        # Skip when CLONE_QR_FROMPLAYWRIGHT_TO_SITE is on - QR is mirrored to the site instead.
                        # Controlled by CLONE_TAB_FALLBACK in config.txt (default: off).
                        if not got_popup and not _is_clone_qr_to_site_enabled():
                            cfg = _load_config()
                            clone_enabled = is_truthy(os.environ.get("SKV_FORCE_CLONE_TAB_FALLBACK", "")) or is_truthy(
                                cfg.get("CLONE_TAB_FALLBACK", "")
                            )
                            if clone_enabled:
                                clone_url = cap.get("auth_spa_url")
                                if not clone_url and cap.get("aid"):
                                    clone_url = f"https://auth.funktionstjanster.se/web/app/v2/68a6db1b897fa1039c3b3d40/67dace697e15efe89cf3d575/?lang=sv&aid={cap['aid']}"
                                if clone_url:
                                    try:
                                        clone_page = browser.new_page()
                                        clone_page.goto(clone_url, wait_until="domcontentloaded", timeout=30000)
                                        _log_qr_data("QR_CLONE_OPENED", {"url": clone_url})
                                    except Exception as e:
                                        _log_qr_data("QR_CLONE_ERROR", str(e))
                            else:
                                _log_qr_data("QR_NO_POPUP_NO_CLONE", {"reason": "CLONE_TAB_FALLBACK not enabled"})

                        if bankid_url:
                            _log_qr_data("BANKID_URL_AVAILABLE", {"url": bankid_url})

                        # Dev signal: keep focus on BankID QR window when requested.
                        if is_truthy(os.environ.get("SKV_SYNLIGT_SKV", "")) and popup_page_ref and not popup_page_ref.is_closed():
                            try:
                                popup_page_ref.bring_to_front()
                                _log_qr_data("QR_FOCUSED_FOR_DEV", {"enabled": True})
                            except Exception:
                                pass
                        break
                    except Exception as e:
                        job.details = job.details or {}
                        job.details["click_errors_3"] = job.details.get("click_errors_3", []) + [f"{sel}: {e}"]
                        job.message = f"Sekvens 3: misslyckades med {sel}, provar nästa..."
                        _set_job(job)
                if not clicked3:
                    job.message = "Klicksekvens 3: ingen selector fungerade. Fortsätter bevaka fältet..."

            # ---- END click sequences ----
            if trace_browser_windows:
                _log_browser_windows(context, "After click sequences", include_focus=True)

            # ---- Wait for login, detect form wizard, run form filler, save HTML ----
            _normal_browser_opened = False
            _form_filler_done = False

            job.message = "Väntar på inloggning (QR)..."
            _set_job(job)

            start = time.time()
            flytt_page = None
            _debug_count = 0
            ready_streak = 0
            ready_source = ""
            loader_seen = False
            loader_hidden_since: Optional[float] = None
            post_auth_scroll_done = False
            post_auth_scroll_wait_target_logged = False

            # Phase 1: Wait for stable readiness signal after QR login
            while (time.time() - start) < timeout_seconds:
                if _is_cancelled(job_id):
                    job.state = "cancelled"
                    job.ended_at = time.time()
                    job.message = "Avbruten av användaren."
                    _log_session("Session cancelled by user", "DONE")
                    try:
                        page.screenshot(path=screenshot_file, full_page=True)
                        job.screenshot_path = f"{job_id}.png"
                    except Exception:
                        pass
                    _set_job(job)
                    browser.close()
                    return

                with _log_lock:
                    api_ready = bool(_qr_captured.get(job_id, {}).get("flytt_api_ready"))

                all_pages = _get_all_pages_for_form(page)

                # QR clone: capture QR from Playwright auth page for mirror view
                if _is_clone_qr_to_site_enabled() and not api_ready:
                    cap = _qr_captured.get(job_id, {})
                    aid_val = cap.get("aid", "")

                    # Fallback: extract aid from page URL if not yet captured from network
                    if not aid_val:
                        for p in all_pages or []:
                            if p is None:
                                continue
                            try:
                                purl = (p.url or "").lower()
                                if "auth.funktionstjanster.se" in purl and "aid=" in purl:
                                    m = re.search(r"aid=([^&]+)", purl, re.IGNORECASE)
                                    if m:
                                        aid_val = m.group(1)
                                        with _log_lock:
                                            if job_id not in _qr_captured:
                                                _qr_captured[job_id] = {}
                                            _qr_captured[job_id]["aid"] = aid_val
                                            _qr_captured[job_id]["qr_page_url"] = (
                                                f"https://auth.funktionstjanster.se/id/bankid/qr?aid={aid_val}"
                                            )
                                        break
                            except Exception:
                                pass
                        cap = _qr_captured.get(job_id, {})
                        aid_val = cap.get("aid", "")

                    has_image = bool(cap.get("qr_image_base64"))
                    now_ts = time.time()
                    last_cap = _qr_capture_last_time.get(job_id, 0)
                    if aid_val and (not has_image or (now_ts - last_cap) >= QR_CAPTURE_INTERVAL_SECONDS):
                        for p in all_pages or []:
                            if p is None:
                                continue
                            try:
                                purl = (p.url or "").lower()
                                if "auth.funktionstjanster.se" in purl and "aid=" in purl:
                                    if _capture_qr_from_playwright_page(p, job_id):
                                        _qr_capture_last_time[job_id] = now_ts
                                        break
                            except Exception:
                                pass

                candidate_page, candidate_source, source_signals, other_signals = _pick_form_page(
                    page, popup_page_ref, api_ready, all_pages
                )

                if candidate_source == "popup":
                    popup_signals = source_signals
                    main_signals = other_signals
                elif candidate_source == "main":
                    main_signals = source_signals
                    popup_signals = other_signals
                else:
                    main_signals = source_signals
                    popup_signals = other_signals

                # Optional gate: once loader has been visible and then disappears after BankID,
                # wait a short delay and auto-scroll the flytt page to expose "Nästa".
                if post_auth_scroll_enabled and not post_auth_scroll_done:
                    loader_visible_any = False
                    loader_checks = []

                    for loader_page in all_pages or [page, popup_page_ref]:
                        if loader_page is None:
                            continue
                        try:
                            if loader_page.is_closed():
                                continue
                            loader_url = loader_page.url or ""
                        except Exception:
                            continue

                        state = _read_loader_state(loader_page, post_auth_loader_selector)
                        if not state.get("ok"):
                            continue

                        exists = bool(state.get("exists"))
                        visible = bool(state.get("visible"))
                        loader_visible_any = loader_visible_any or visible
                        loader_checks.append(
                            {
                                "url": loader_url[:140],
                                "exists": exists,
                                "visible": visible,
                            }
                        )

                    if loader_visible_any:
                        if not loader_seen:
                            _log_qr_data(
                                "LOADER_VISIBLE",
                                {
                                    "selector": post_auth_loader_selector,
                                    "pages": loader_checks,
                                },
                            )
                        loader_seen = True
                        loader_hidden_since = None
                        post_auth_scroll_wait_target_logged = False
                    elif loader_seen and not loader_visible_any:
                        now_ts = time.time()
                        if loader_hidden_since is None:
                            loader_hidden_since = now_ts
                            _log_qr_data(
                                "LOADER_HIDDEN",
                                {
                                    "selector": post_auth_loader_selector,
                                    "delay_seconds": post_auth_scroll_delay_seconds,
                                    "pages": loader_checks,
                                },
                            )
                        elif (now_ts - loader_hidden_since) >= post_auth_scroll_delay_seconds:
                            target_pages = []
                            if candidate_page is not None:
                                try:
                                    if not candidate_page.is_closed():
                                        target_pages.append(candidate_page)
                                except Exception:
                                    pass

                            for scroll_page in all_pages or [page, popup_page_ref]:
                                if scroll_page is None:
                                    continue
                                try:
                                    if scroll_page.is_closed():
                                        continue
                                    scroll_url = scroll_page.url or ""
                                except Exception:
                                    continue
                                if "flytt" in scroll_url.lower():
                                    target_pages.append(scroll_page)

                            unique_target_pages = []
                            seen_page_ids = set()
                            for target in target_pages:
                                tid = id(target)
                                if tid in seen_page_ids:
                                    continue
                                seen_page_ids.add(tid)
                                unique_target_pages.append(target)

                            scrolled_pages = []
                            for target in unique_target_pages:
                                try:
                                    target_url = target.url or ""
                                    if "flytt" not in target_url.lower():
                                        continue
                                    metrics = _scroll_page_to_bottom(target)
                                    scrolled_pages.append(
                                        {
                                            "url": target_url[:140],
                                            "scrollY": metrics.get("scrollY"),
                                            "maxY": metrics.get("maxY"),
                                        }
                                    )
                                except Exception as e:
                                    _log_qr_data(
                                        "POST_AUTH_SCROLL_FAIL",
                                        {"error": str(e)},
                                    )

                            if scrolled_pages:
                                _log_session(
                                    "Post-auth auto-scroll executed",
                                    "FORM_WAIT",
                                    {
                                        "selector": post_auth_loader_selector,
                                        "delay_seconds": post_auth_scroll_delay_seconds,
                                        "pages": scrolled_pages,
                                    },
                                )
                                post_auth_scroll_done = True
                                time.sleep(0.3)
                            elif not post_auth_scroll_wait_target_logged:
                                _log_session(
                                    "Loader hidden but no flytt page scroll target yet",
                                    "FORM_WAIT",
                                    {
                                        "selector": post_auth_loader_selector,
                                        "tabs_checked": len(all_pages) if all_pages else 0,
                                    },
                                )
                                post_auth_scroll_wait_target_logged = True

                # Debug: log what we see every 5 seconds
                _debug_count += 1
                if _debug_count % 5 == 0:
                    elapsed = int(time.time() - start)
                    status_bits = (
                        f"main(form={main_signals.get('has_form')},wiz={main_signals.get('has_wizard_step')},"
                        f"active={main_signals.get('has_active_step')},next={main_signals.get('has_next_host')})"
                    )
                    if popup_signals:
                        status_bits += (
                            f", popup(form={popup_signals.get('has_form')},wiz={popup_signals.get('has_wizard_step')},"
                            f"active={popup_signals.get('has_active_step')},next={popup_signals.get('has_next_host')})"
                        )
                    status_bits += f", api_ready={api_ready}, streak={ready_streak}/2"
                    job.message = f"Väntar på formulär ({elapsed}s)... {status_bits}"
                    _set_job(job)
                    _log_session(
                        f"Waiting for form ({elapsed}s)",
                        "FORM_WAIT",
                        {
                            "api_ready": api_ready,
                            "candidate_source": candidate_source,
                            "tabs_checked": len(all_pages) if all_pages else 0,
                            "streak": f"{ready_streak}/2",
                        },
                    )
                    if trace_browser_windows and (time.time() - last_trace_ts) >= trace_interval_seconds:
                        _log_browser_windows(
                            context,
                            f"Window snapshot while waiting ({elapsed}s)",
                            include_focus=True,
                        )
                        last_trace_ts = time.time()

                if candidate_page:
                    if ready_source == candidate_source:
                        ready_streak += 1
                    else:
                        ready_source = candidate_source
                        ready_streak = 1

                    if ready_streak == 1:
                        _log_qr_data(
                            "FORM_READY_CANDIDATE",
                            {"source": candidate_source, "api_ready": api_ready, "signals": source_signals},
                        )
                        if trace_browser_windows:
                            _log_browser_windows(context, "FORM_READY_CANDIDATE snapshot", include_focus=True)

                    if ready_streak >= 2:
                        flytt_page = candidate_page
                        _log_session(
                            f"Form detected on {candidate_source}",
                            "FORM_DETECT",
                            {"url": flytt_page.url, "signals": source_signals},
                        )
                        job.message = f"Formulär hittat på {candidate_source}, startar ifyllning..."
                        _set_job(job)
                        time.sleep(1.5)
                        break
                else:
                    ready_streak = 0
                    ready_source = ""

                    # Fallback: on flytt URL but form not detected - scroll down (Nästa below fold),
                    # then try clicking first Nästa. Check ALL tabs (form often opens in new tab after BankID).
                    if _debug_count % 10 == 1:
                        for try_page in all_pages or [page, popup_page_ref]:
                            if try_page is None or try_page.is_closed():
                                continue
                            try:
                                url = try_page.url or ""
                                if "flytt" not in url.lower():
                                    continue
                                # Scroll down first - Nästa is often below viewport on intro page
                                try_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                                time.sleep(0.5)
                                # Playwright pierces shadow DOM; try primary + text fallback
                                loc = try_page.locator(FORM_NEXT_HOST_SELECTOR)
                                if loc.count() > 0:
                                    loc.first.scroll_into_view_if_needed()
                                    time.sleep(0.3)
                                    loc.first.click(timeout=3000)
                                    _log_qr_data("NÄSTA_FALLBACK_CLICK", {"url": url[:60]})
                                    job.message = "Klickade på Nästa (fallback), väntar på formulär..."
                                    _set_job(job)
                                    time.sleep(2.0)
                                    break
                                # Fallback: button with "Nästa" text (pierces shadow DOM)
                                alt_loc = try_page.get_by_role("button", name="Nästa")
                                if alt_loc.count() > 0:
                                    alt_loc.first.scroll_into_view_if_needed()
                                    time.sleep(0.3)
                                    alt_loc.first.click(timeout=3000)
                                    _log_qr_data("NÄSTA_FALLBACK_CLICK", {"url": url[:60], "selector": "role"})
                                    job.message = "Klickade på Nästa (fallback), väntar på formulär..."
                                    _set_job(job)
                                    time.sleep(2.0)
                                    break
                            except Exception as e:
                                _log_qr_data("NÄSTA_FALLBACK_FAIL", {"error": str(e)})

                time.sleep(1.0)

            if not flytt_page:
                with _log_lock:
                    api_ready = bool(_qr_captured.get(job_id, {}).get("flytt_api_ready"))
                all_pages = _get_all_pages_for_form(page)
                candidate_page, candidate_source, source_signals, _ = _pick_form_page(
                    page, popup_page_ref, api_ready, all_pages
                )
                if candidate_page:
                    flytt_page = candidate_page
                    _log_session(
                        f"Form detected late on {candidate_source}",
                        "FORM_DETECT",
                        {"url": flytt_page.url, "signals": source_signals},
                    )

            if flytt_page and not _normal_browser_opened:
                cfg = _load_config()
                disable_normal_browser = is_truthy(os.environ.get("SKV_DISABLE_NORMAL_BROWSER_WINDOW", ""))
                if is_truthy(cfg.get("POPUP_BROWSER_NORMAL_WINDOW", "")) and not disable_normal_browser:
                    try:
                        webbrowser.open(flytt_page.url)
                        _normal_browser_opened = True
                        _log_session("Opened form URL in default browser (POPUP_BROWSER_NORMAL_WINDOW)", "FORM_DETECT")
                    except Exception:
                        pass
            if trace_browser_windows:
                _log_browser_windows(context, "Before form filler", include_focus=True)

            # Phase 2: Run form filler (output goes to session log)
            if flytt_page:
                try:
                    from formulär.flytt_form_filler import run_flytt_form_filler

                    def _form_log(msg: str) -> None:
                        _log_session(msg.strip(), "FORM")

                    job.message = "Fyller flyttformulär..."
                    _set_job(job)
                    _log_session("Starting form filler", "FORM")
                    payload_file = payload_file or os.environ.get("SKV_PAYLOAD_FILE", DEFAULT_PAYLOAD_FILE)
                    allow_mockup = is_truthy(os.environ.get("SKV_ALLOW_MOCKUP_DATA", "y"))
                    run_flytt_form_filler(
                        flytt_page,
                        lambda: _is_cancelled(job_id),
                        log_callback=_form_log,
                        payload_path=payload_file,
                        allow_mockup_data=allow_mockup,
                    )
                    _form_filler_done = True
                except Exception as e:
                    job.details = job.details or {}
                    job.details["flytt_filler_error"] = str(e)
                    _log_session(f"Form filler error: {e}", "FORM")

            # Phase 3: Save full page HTML snapshot
            try:
                save_page = flytt_page or page
                html_content = save_page.content()
                html_path = os.path.join(SCRIPT_DIR, "senaste_formulär.html")
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(html_content)
            except Exception:
                pass

            try:
                final_page = flytt_page or page
                final_page.screenshot(path=screenshot_file, full_page=True)
                job.screenshot_path = f"{job_id}.png"
            except Exception:
                job.screenshot_path = None

            job.ended_at = time.time()

            if _form_filler_done:
                job.state = "matched"
                job.message = "Formulär ifyllt! Se skv6_session_log.txt + senaste_formulär.html"
                _log_session("Session completed successfully", "DONE")
            elif job.state != "cancelled":
                job.state = "timeout"
                job.message = "Timeout: formuläret hittades inte inom vald tid (inloggning klar?)."
                _log_session("Session ended: form not found within timeout", "DONE")

            if trace_browser_windows:
                _log_browser_windows(context, "Final browser snapshot", include_focus=True)
            _set_job(job)
            try:
                browser.close()
            except Exception:
                pass
            _schedule_job_cleanup(job_id)

    except Exception as e:
        job.state = "error"
        job.ended_at = time.time()
        job.message = f"Fel: {e}"
        _log_session(f"Session error: {e}", "DONE")
        _set_job(job)
        _schedule_job_cleanup(job_id)


MAX_ELEMENTS_LOG = 500


def _run_open_url_scrape_job(job_id: str, url: str, search_text: Optional[str] = None, wait_seconds: float = 0.0) -> None:
    """Öppna URL i Playwright (synligt fönster), samla upp till MAX_ELEMENTS_LOG element (synliga endast).
    Om search_text anges returneras endast element vars text innehåller söksträngen.
    wait_seconds: extra väntetid (sek) efter networkidle innan DOM-scan."""
    job = _get_job(job_id)
    if not job:
        return

    job.state = "running"
    job.started_at = time.time()
    job.message = "Öppnar webbläsare..."
    job.details = job.details or {}
    job.details["element_log"] = []
    _set_job(job)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                args=["--disable-features=LocalNetworkAccessChecks"],
            )
            page = browser.new_page()
            job.message = f"Går till: {url}"
            _set_job(job)
            try:
                page.goto(url, wait_until="networkidle", timeout=60000)
            except Exception:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if wait_seconds > 0:
                job.message = f"Väntar {wait_seconds}s extra för JS-rendering..."
                _set_job(job)
                time.sleep(wait_seconds)

            job.message = "Samlar synliga element..." if not search_text else f"Söker efter \"{search_text}\"..."
            _set_job(job)

            search_js = (search_text or "").strip().replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
            elements_data = page.evaluate(
                """(params) => {
                    const maxEl = params.maxEl || 500;
                    const searchStr = params.searchStr || '';
                    const skip = ['script','style','noscript','head','meta','link','template'];
                    const vpW = window.innerWidth || 1;
                    const vpH = window.innerHeight || 1;
                    const pageW = Math.max(document.body ? document.body.scrollWidth : vpW, document.documentElement ? document.documentElement.scrollWidth : vpW, vpW);
                    const pageH = Math.max(document.body ? document.body.scrollHeight : vpH, document.documentElement ? document.documentElement.scrollHeight : vpH, vpH);
                    const clamp = (v) => Math.max(0, Math.min(100, v));
                    const pct1 = (v, base) => Math.round(clamp(v / base * 100) * 10) / 10;
                    const all = Array.from(document.querySelectorAll('*')).filter(el => {
                        const tag = (el.tagName || '').toLowerCase();
                        if (skip.includes(tag)) return false;
                        let r;
                        try { r = el.getBoundingClientRect(); } catch(e) { return false; }
                        if (!r || r.width <= 0 || r.height <= 0) return false;
                        if (searchStr) {
                            const raw = (el.innerText || el.textContent || '').trim();
                            if (!raw.toLowerCase().includes(searchStr.toLowerCase())) return false;
                        }
                        return true;
                    });
                    return all.slice(0, maxEl).map(el => {
                        const tag = (el.tagName || '').toLowerCase();
                        const id = el.id ? '#' + el.id : '';
                        let cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
                        if (cls) cls = '.' + cls;
                        let text = '';
                        try { const t = (el.innerText || el.textContent || '').trim().replace(/\\s+/g,' ').slice(0, 120); if(t) text = ' "' + t + '"'; } catch(e) {}
                        let left = 0, top = 0, width = 0, height = 0;
                        try {
                            const r = el.getBoundingClientRect();
                            left = Math.round(r.left + window.scrollX);
                            top = Math.round(r.top + window.scrollY);
                            width = Math.round(r.width);
                            height = Math.round(r.height);
                        } catch(e) {}
                        return { tag, id, cls, text, left, top, width, height,
                            vp_x: pct1(left, vpW), vp_y: pct1(top, vpH), vp_w: pct1(width, vpW), vp_h: pct1(height, vpH),
                            pg_x: pct1(left, pageW), pg_y: pct1(top, pageH), pg_w: pct1(width, pageW), pg_h: pct1(height, pageH) };
                    });
                }""",
                {"maxEl": MAX_ELEMENTS_LOG, "searchStr": search_js},
            )

            log_lines = []
            for i, item in enumerate(elements_data or [], 1):
                tag = item.get("tag", "?")
                id_part = item.get("id", "")
                cls_part = item.get("cls", "")
                text_part = item.get("text", "")
                left = item.get("left", 0)
                top = item.get("top", 0)
                width = item.get("width", 0)
                height = item.get("height", 0)
                vp = f" [vp: x={item.get('vp_x',0)}% y={item.get('vp_y',0)}% w={item.get('vp_w',0)}% h={item.get('vp_h',0)}%]"
                pg = f" [page: x={item.get('pg_x',0)}% y={item.get('pg_y',0)}% w={item.get('pg_w',0)}% h={item.get('pg_h',0)}%]"
                coords = f" [x={left}, y={top}, w={width}, h={height}]{vp}{pg}"
                line = f"{i}. {tag}{id_part}{cls_part}{text_part}{coords}"
                log_lines.append(line)

            job.details["element_log"] = log_lines
            job.ended_at = time.time()
            job.state = "matched"
            if search_text:
                job.message = f"Klar. {len(log_lines)} element innehåller \"{search_text}\" (max {MAX_ELEMENTS_LOG})."
            else:
                job.message = f"Klar. {len(log_lines)} synliga element loggade (max {MAX_ELEMENTS_LOG})."
            _set_job(job)
            browser.close()
            _schedule_job_cleanup(job_id)
    except Exception as e:
        job.state = "error"
        job.ended_at = time.time()
        job.message = f"Fel: {e}"
        job.details = job.details or {}
        job.details["element_log"] = job.details.get("element_log", []) + [f"Fel: {e}"]
        _set_job(job)
        _schedule_job_cleanup(job_id)


def _run_click_mode_job(job_id: str, url: str) -> None:
    """Öppna URL i Playwright (synligt fönster), injicera klicklyssnare – vid klick skickas elementinfo till job.details (last_click, click_log)."""
    job = _get_job(job_id)
    if not job:
        return

    job.state = "running"
    job.started_at = time.time()
    job.message = "Öppnar Playwright-fönster – klicka på sidan för att se elementinfo här."
    job.details = job.details or {}
    job.details["last_click"] = None
    job.details["click_log"] = []
    _set_job(job)

    # Base URL for click-report API (Playwright page will POST here from any origin)
    api_base = os.environ.get("SKV_CLICK_API_BASE", f"http://127.0.0.1:{APP_PORT}")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                args=["--disable-features=LocalNetworkAccessChecks"],
            )
            page = browser.new_page()

            job.message = f"Går till: {url} – klicka på ett element."
            _set_job(job)
            page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Inject click listener that POSTs to our API (works from any origin)
            page.evaluate(
                """(args) => {
                    var baseUrl = args.baseUrl || 'http://127.0.0.1:8767';
                    var jobId = args.jobId || '';
                    function sendClick(el) {
                        try {
                            var r = el.getBoundingClientRect();
                            var vpW = window.innerWidth || 1;
                            var vpH = window.innerHeight || 1;
                            var pageW = Math.max(document.body ? document.body.scrollWidth : vpW, document.documentElement ? document.documentElement.scrollWidth : vpW, vpW);
                            var pageH = Math.max(document.body ? document.body.scrollHeight : vpH, document.documentElement ? document.documentElement.scrollHeight : vpH, vpH);
                            function clamp(v){return Math.max(0,Math.min(100,v));}
                            function pct1(v,b){return Math.round(clamp(v/b*100)*10)/10;}
                            var left = Math.round(r.left + window.scrollX);
                            var top = Math.round(r.top + window.scrollY);
                            var width = Math.round(r.width);
                            var height = Math.round(r.height);
                            var payload = {
                                job_id: jobId,
                                tag: el.tagName ? el.tagName.toLowerCase() : '',
                                id: el.id || '',
                                cls: (el.className && typeof el.className === 'string') ? el.className.trim().split(/\\s+/).slice(0,2).join('.') : '',
                                text: (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120),
                                left: left, top: top, width: width, height: height,
                                vp_x: pct1(left,vpW), vp_y: pct1(top,vpH), vp_w: pct1(width,vpW), vp_h: pct1(height,vpH),
                                pg_x: pct1(left,pageW), pg_y: pct1(top,pageH), pg_w: pct1(width,pageW), pg_h: pct1(height,pageH)
                            };
                            fetch(baseUrl + '/api/click-report', {
                                method: 'POST',
                                mode: 'cors',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            }).catch(function() {});
                        } catch(err) {}
                    }
                    document.addEventListener('click', function(e) { sendClick(e.target); }, true);
                }""",
                {"baseUrl": api_base, "jobId": job_id},
            )

            job.message = "Fönster öppet – klicka var som helst på sidan. Elementinfo visas här. Klicka 'Stäng fönster' när du är klar."
            _set_job(job)

            while not _is_cancelled(job_id):
                req = None
                j = _get_job(job_id)
                if j and j.details:
                    req = j.details.pop("element_at_point_request", None)
                if req and isinstance(req, dict):
                    x_val = req.get("x", 0)
                    y_val = req.get("y", 0)
                    try:
                        result = page.evaluate(
                            """(xy) => {
                                var el = document.elementFromPoint(xy.x, xy.y);
                                if (!el) return { error: 'Inget element vid dessa koordinater' };
                                var r = el.getBoundingClientRect();
                                var vpW = window.innerWidth || 1;
                                var vpH = window.innerHeight || 1;
                                var pageW = Math.max(document.body ? document.body.scrollWidth : vpW, document.documentElement ? document.documentElement.scrollWidth : vpW, vpW);
                                var pageH = Math.max(document.body ? document.body.scrollHeight : vpH, document.documentElement ? document.documentElement.scrollHeight : vpH, vpH);
                                function clamp(v){return Math.max(0,Math.min(100,v));}
                                function pct1(v,b){return Math.round(clamp(v/b*100)*10)/10;}
                                var tag = (el.tagName || '').toLowerCase();
                                var id = el.id || '';
                                var cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\\s+/).slice(0,3).join('.') : '';
                                var text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 200);
                                var left = Math.round(r.left + window.scrollX);
                                var top = Math.round(r.top + window.scrollY);
                                var width = Math.round(r.width);
                                var height = Math.round(r.height);
                                return {
                                    tag: tag, id: id, cls: cls, text: text,
                                    left: left, top: top, width: width, height: height,
                                    href: el.href || (el.getAttribute && el.getAttribute('href')) || '',
                                    name: el.name || (el.getAttribute && el.getAttribute('name')) || '',
                                    type: el.type || (el.getAttribute && el.getAttribute('type')) || '',
                                    vp_x: pct1(left,vpW), vp_y: pct1(top,vpH), vp_w: pct1(width,vpW), vp_h: pct1(height,vpH),
                                    pg_x: pct1(left,pageW), pg_y: pct1(top,pageH), pg_w: pct1(width,pageW), pg_h: pct1(height,pageH)
                                };
                            }""",
                            {"x": int(x_val), "y": int(y_val)},
                        )
                        j = _get_job(job_id)
                        if j:
                            j.details = j.details or {}
                            j.details["element_at_point_result"] = result
                            _set_job(j)
                    except Exception as e:
                        j = _get_job(job_id)
                        if j:
                            j.details = j.details or {}
                            j.details["element_at_point_result"] = {"error": str(e)}
                            _set_job(j)
                time.sleep(0.5)
            try:
                browser.close()
            except Exception:
                pass
            job.state = "cancelled"
            job.ended_at = time.time()
            job.message = "Fönster stängt."
            _set_job(job)
            _schedule_job_cleanup(job_id)
    except Exception as e:
        job.state = "error"
        job.ended_at = time.time()
        job.message = f"Fel: {e}"
        job.details = job.details or {}
        job.details["click_log"] = job.details.get("click_log", []) + [f"Fel: {e}"]
        _set_job(job)
        _schedule_job_cleanup(job_id)


# ----------------------------
# Web UI
# ----------------------------

START_HTML = """
<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Öppna URL – Elementlogg</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; max-width: 720px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 20px; }
    label { display: block; font-size: 13px; margin-top: 12px; color: #333; }
    input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #ccc; box-sizing: border-box; }
    button { margin-top: 14px; padding: 12px 20px; border-radius: 10px; border: 1px solid #333; background: #111; color: #fff; cursor: pointer; font-size: 1rem; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .log { white-space: pre-wrap; font-family: ui-monospace, Consolas, monospace; font-size: 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 10px; padding: 14px; margin-top: 16px; min-height: 280px; max-height: 50vh; overflow-y: auto; }
    .small { font-size: 12px; color: #666; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>Öppna URL – Elementlogg</h1>
  <p class="small">Ange URL och klicka Okej. Endast synliga element (w&gt;0, h&gt;0) loggas. Ange valfritt sökord för att bara visa element som innehåller texten (t.ex. "Logga in", "State of the Art").</p>

  <div class="card">
    <label for="url">URL</label>
    <input id="url" type="url" placeholder="https://example.com" value="https://www7.skatteverket.se/portal/flyttanmalan/" />
    <label for="searchText">Sök text (valfritt) – endast element som innehåller denna text visas</label>
    <input id="searchText" type="text" placeholder="t.ex. Logga in, State of the Art" />
    <label for="scrapeWait">Extra väntetid (sek) – låt JS/SPA rendera klart innan scan (0 = ingen extra väntan)</label>
    <input id="scrapeWait" type="number" min="0" max="60" step="0.5" placeholder="0" value="0" />
    <button id="okBtn" onclick="openAndLog()">Okej</button>

    <label for="logField" style="margin-top: 18px;">Logg (synliga element, max 500, med koordinater)</label>
    <div id="logField" class="log" aria-live="polite">Ingen körning ännu. Ange URL och klicka Okej.</div>
  </div>

  <div class="card" style="margin-top: 20px;">
    <h2 style="margin-top: 0;">Klicka för elementinfo</h2>
    <p class="small">Öppna en sida i ett Playwright-fönster. Klicka var som helst på sidan – elementinfo (tag, id, klass, text, koordinater) visas här i huvudfönstret.</p>
    <label for="clickUrl">URL</label>
    <input id="clickUrl" type="url" placeholder="https://example.com" value="https://example.com" />
    <div style="display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap;">
      <button id="openClickBtn" onclick="openClickMode()">Öppna Playwright-fönster</button>
      <button id="closeClickBtn" class="secondary" onclick="closeClickMode()" disabled>Stäng fönster</button>
    </div>
    <label for="clickLogField" style="margin-top: 18px;">Elementinfo (senast klickade + alla klick)</label>
    <div id="clickLogField" class="log" aria-live="polite" style="min-height: 200px;">Öppna ett fönster och klicka på sidan. Info visas här.</div>
  </div>

  <div class="card" style="margin-top: 20px;">
    <h2 style="margin-top: 0;">Element vid koordinater</h2>
    <p class="small">Ange URL och koordinater (x, y i viewport-px). Playwright öppnar sidan, hämtar elementet vid den punkten och stänger sedan fönstret.</p>
    <label for="coordUrl">URL</label>
    <input id="coordUrl" type="url" placeholder="https://example.com" value="https://example.com" />
    <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-top: 8px;">
      <div style="min-width: 90px;">
        <label for="coordX">X</label>
        <input id="coordX" type="number" placeholder="0" value="100" />
      </div>
      <div style="min-width: 90px;">
        <label for="coordY">Y</label>
        <input id="coordY" type="number" placeholder="0" value="100" />
      </div>
      <div style="min-width: 110px;">
        <label for="coordWait">Extra väntetid (sek)</label>
        <input id="coordWait" type="number" min="0" max="30" step="0.5" placeholder="0" value="0" />
      </div>
      <button id="getAtPointBtn" onclick="getElementAtPoint()">Hämta elementinfo</button>
    </div>
    <label for="coordResultField" style="margin-top: 14px;">Elementinfo vid (x, y)</label>
    <div id="coordResultField" class="log" aria-live="polite" style="min-height: 140px;">Ange URL, x, y och klicka Hämta.</div>
  </div>

  <p class="small" style="margin-top: 16px;"><a href="/flytt">Flyttanmälan – full flöde</a></p>

<script>
let currentJobId = null;
let pollTimer = null;

function setLog(lines, status) {
  const el = document.getElementById("logField");
  if (lines && lines.length) {
    el.textContent = status ? status + "\\n\\n" + lines.join("\\n") : lines.join("\\n");
  } else {
    el.textContent = status || "Ingen data.";
  }
}

async function openAndLog() {
  const url = document.getElementById("url").value.trim();
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    document.getElementById("logField").textContent = "Ange en giltig URL (http:// eller https://).";
    return;
  }

  document.getElementById("okBtn").disabled = true;
  document.getElementById("logField").textContent = "Startar...";

  const waitSec = parseFloat(document.getElementById("scrapeWait").value) || 0;
  const res = await fetch("/api/open-and-scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: url,
      search_text: document.getElementById("searchText").value.trim() || null,
      wait_seconds: waitSec
    }),
  });
  const data = await res.json();
  if (data.error) {
    document.getElementById("logField").textContent = "Fel: " + data.error;
    document.getElementById("okBtn").disabled = false;
    return;
  }

  currentJobId = data.job_id;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollLog, 500);
  pollLog();
}

async function pollLog() {
  if (!currentJobId) return;
  const res = await fetch("/api/status/" + encodeURIComponent(currentJobId));
  const data = await res.json();
  const details = data.details || {};
  const lines = details.element_log || [];
  const status = data.message || data.state || "";
  setLog(lines, status);

  if (["matched", "error", "cancelled"].includes(data.state)) {
    clearInterval(pollTimer);
    pollTimer = null;
    document.getElementById("okBtn").disabled = false;
  }
}

let currentClickJobId = null;
let clickPollTimer = null;

function setClickLog(lines, status) {
  const el = document.getElementById("clickLogField");
  if (lines && lines.length) {
    el.textContent = status ? status + "\\n\\n" + lines.join("\\n") : lines.join("\\n");
  } else {
    el.textContent = status || "Öppna ett fönster och klicka på sidan. Info visas här.";
  }
}

async function openClickMode() {
  const url = document.getElementById("clickUrl").value.trim();
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    document.getElementById("clickLogField").textContent = "Ange en giltig URL (http:// eller https://).";
    return;
  }

  document.getElementById("openClickBtn").disabled = true;
  document.getElementById("clickLogField").textContent = "Öppnar Playwright-fönster...";

  const res = await fetch("/api/open-click-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url }),
  });
  const data = await res.json();
  if (data.error) {
    document.getElementById("clickLogField").textContent = "Fel: " + data.error;
    document.getElementById("openClickBtn").disabled = false;
    return;
  }

  currentClickJobId = data.job_id;
  document.getElementById("closeClickBtn").disabled = false;
  if (clickPollTimer) clearInterval(clickPollTimer);
  clickPollTimer = setInterval(pollClickMode, 400);
  pollClickMode();
}

async function pollClickMode() {
  if (!currentClickJobId) return;
  const res = await fetch("/api/status/" + encodeURIComponent(currentClickJobId));
  const data = await res.json();
  const details = data.details || {};
  const lines = details.click_log || [];
  const status = data.message || "";
  setClickLog(lines, status);

  const coordResult = details.element_at_point_result;
  const coordEl = document.getElementById("coordResultField");
  if (coordResult !== undefined && coordResult !== null) {
    if (typeof coordResult === 'object' && coordResult.error) {
      coordEl.textContent = "Fel: " + coordResult.error;
    } else if (typeof coordResult === 'object') {
      const parts = [];
      if (coordResult.tag) parts.push('tag:   ' + coordResult.tag);
      if (coordResult.id) parts.push('id:    ' + coordResult.id);
      if (coordResult.cls) parts.push('klass: ' + coordResult.cls);
      if (coordResult.text) parts.push('text:  "' + coordResult.text + '"');
      if (coordResult.href) parts.push('href:  ' + coordResult.href);
      if (coordResult.name) parts.push('name:  ' + coordResult.name);
      if (coordResult.type) parts.push('type:  ' + coordResult.type);
      parts.push('pos:   x=' + coordResult.left + ' y=' + coordResult.top + ' w=' + coordResult.width + ' h=' + coordResult.height);
      parts.push('vp:    x=' + (coordResult.vp_x||0) + '% y=' + (coordResult.vp_y||0) + '% w=' + (coordResult.vp_w||0) + '% h=' + (coordResult.vp_h||0) + '%');
      parts.push('page:  x=' + (coordResult.pg_x||0) + '% y=' + (coordResult.pg_y||0) + '% w=' + (coordResult.pg_w||0) + '% h=' + (coordResult.pg_h||0) + '%');
      coordEl.textContent = parts.join("\\n");
    } else {
      coordEl.textContent = String(coordResult);
    }
  }

  if (["cancelled", "error"].includes(data.state)) {
    clearInterval(clickPollTimer);
    clickPollTimer = null;
    currentClickJobId = null;
    document.getElementById("openClickBtn").disabled = false;
    document.getElementById("closeClickBtn").disabled = true;
    document.getElementById("coordResultField").textContent = "Ange x, y och klicka Hämta. Kräver att Playwright-fönster är öppet.";
  }
}

async function closeClickMode() {
  if (!currentClickJobId) return;
  await fetch("/api/cancel/" + encodeURIComponent(currentClickJobId), { method: "POST" });
}

async function getElementAtPoint() {
  const url = document.getElementById("coordUrl").value.trim();
  const x = parseInt(document.getElementById("coordX").value, 10);
  const y = parseInt(document.getElementById("coordY").value, 10);
  const coordEl = document.getElementById("coordResultField");
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    coordEl.textContent = "Ange en giltig URL (http:// eller https://).";
    return;
  }
  if (isNaN(x) || isNaN(y)) {
    coordEl.textContent = "Ange giltiga heltal för X och Y.";
    return;
  }
  const waitSec = parseFloat(document.getElementById("coordWait").value) || 0;
  document.getElementById("getAtPointBtn").disabled = true;
  coordEl.textContent = waitSec > 0
    ? `Öppnar sida, väntar ${waitSec}s och hämtar element...`
    : "Öppnar sida (väntar på networkidle) och hämtar element...";
  const res = await fetch("/api/fetch-element-at-point", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url, x: x, y: y, wait_seconds: waitSec }),
  });
  const data = await res.json();
  document.getElementById("getAtPointBtn").disabled = false;
  if (data.error) {
    coordEl.textContent = "Fel: " + data.error;
    return;
  }
  const el = data.element || {};
  if (el.error) {
    coordEl.textContent = "Fel: " + el.error;
    return;
  }
  const lines = [];
  if (el.tag) lines.push("tag:   " + el.tag);
  if (el.id) lines.push("id:    " + el.id);
  if (el.cls) lines.push("klass: " + el.cls);
  if (el.text) lines.push('text:  "' + el.text + '"');
  if (el.href) lines.push("href:  " + el.href);
  if (el.name) lines.push("name:  " + el.name);
  if (el.type) lines.push("type:  " + el.type);
  lines.push("pos:   x=" + el.left + " y=" + el.top + " w=" + el.width + " h=" + el.height);
  lines.push("vp:    x=" + (el.vp_x||0) + "% y=" + (el.vp_y||0) + "% w=" + (el.vp_w||0) + "% h=" + (el.vp_h||0) + "%");
  lines.push("page:  x=" + (el.pg_x||0) + "% y=" + (el.pg_y||0) + "% w=" + (el.pg_w||0) + "% h=" + (el.pg_h||0) + "%");
  coordEl.textContent = lines.join("\\n");
}
</script>
</body>
</html>
"""

INDEX_HTML = """
<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Flyttanmälan – Auto</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; }
    .row { display: flex; gap: 16px; flex-wrap: wrap; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; max-width: 980px; }
    label { display:block; font-size: 13px; margin-top: 10px; color: #333; }
    input, select { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid #ccc; }
    button { padding: 10px 14px; border-radius: 10px; border: 1px solid #333; background: #111; color: #fff; cursor: pointer; }
    button.secondary { background: #fff; color: #111; border-color: #111; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .status { white-space: pre-wrap; background: #f7f7f7; border-radius: 10px; padding: 12px; border: 1px solid #eee; }
    .small { font-size: 12px; color: #666; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    img { max-width: 100%; border-radius: 10px; border: 1px solid #eee; }
  </style>
</head>
<body>
  <h1>Flyttanmälan – Auto</h1>
  <p class="small">
    Klicksekvenser → QR-inloggning → formuläret fylls automatiskt.
    Logg: <code>skv6_session_log.txt</code> (en fil per session, överskriver föregående)
    <br><a href="/">Öppna URL – enkel elementlogg</a>
  </p>

  <div class="card">
    <h2>1) Logga in och fyll formulär</h2>

    <div class="row">
      <div style="flex: 2; min-width: 280px;">
        <label>URL att öppna</label>
        <input id="targetUrl" value="https://www7.skatteverket.se/portal/flyttanmalan/" />
      </div>
      <div style="flex: 1; min-width: 220px;">
        <label>Timeout (sekunder)</label>
        <input id="timeoutSeconds" type="number" min="1" value="300" />
      </div>
    </div>

    <div class="row" style="margin-top: 12px;">
      <div style="flex: 1; min-width: 140px;">
        <label>Klicksekvens 0: vänta (sek) – cookie-banner</label>
        <input id="clickAfterSeconds0" type="number" min="0" step="0.5" value="1.5" placeholder="0 = ingen" />
      </div>
      <div style="flex: 2; min-width: 280px;">
        <label>Klicksekvens 0: selectors (primär: nödvändiga, backup: alla)</label>
        <textarea id="clickSelectors0" class="mono" rows="4" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ccc; resize:vertical;">#deny-all
skv-button-8-6-2#deny-all
button:has-text("Tillåt endast nödvändiga")
#accept-all</textarea>
      </div>
    </div>

    <div class="row" style="margin-top: 12px;">
      <div style="flex: 1; min-width: 140px;">
        <label>Klicksekvens 1: vänta (sek)</label>
        <input id="clickAfterSeconds" type="number" min="0" step="0.5" value="3" placeholder="0 = ingen" />
      </div>
      <div style="flex: 2; min-width: 280px;">
        <label>Klicksekvens 1: selectors (en per rad)</label>
        <textarea id="clickSelectors" class="mono" rows="4" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ccc; resize:vertical;">a[aria-label*="Inloggning"]
button#login-info-button
slot.fin-skv-button-label
span.fin-skv-button-spinner</textarea>
      </div>
    </div>

    <div class="row" style="margin-top: 12px;">
      <div style="flex: 1; min-width: 140px;">
        <label>Klicksekvens 2: vänta (sek)</label>
        <input id="clickAfterSeconds2" type="number" min="0" step="0.5" value="3" placeholder="0 = ingen" />
      </div>
      <div style="flex: 2; min-width: 280px;">
        <label>Klicksekvens 2: selectors (BankID-knapp)</label>
        <textarea id="clickSelectors2" class="mono" rows="2" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ccc; resize:vertical;">button#bankid-standard
#bankid-standard</textarea>
      </div>
    </div>

    <div class="row" style="margin-top: 12px;">
      <div style="flex: 1; min-width: 140px;">
        <label>Klicksekvens 3: vänta (sek)</label>
        <input id="clickAfterSeconds3" type="number" min="0" step="0.5" value="3" placeholder="0 = ingen" />
      </div>
      <div style="flex: 2; min-width: 280px;">
        <label>Klicksekvens 3: selectors (QR-kod, öppnar i ny flik)</label>
        <textarea id="clickSelectors3" class="mono" rows="3" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ccc; resize:vertical;">path[fill='#FFFFFF']
path[fill='#000000']
svg path</textarea>
      </div>
    </div>

    <div style="margin-top: 14px; display:flex; gap:10px; flex-wrap:wrap;">
      <button id="startBtn" onclick="startJob()">Starta</button>
      <button class="secondary" id="cancelBtn" onclick="cancelJob()" disabled>Avbryt</button>
      <button class="secondary" id="cloneBtn" onclick="openCloneView()" disabled>Öppna QR-spegel (experiment)</button>
    </div>

    <h3 style="margin-top: 16px;">Status</h3>
    <div id="status" class="status">Ingen körning ännu.</div>
    <div id="shotWrap" style="margin-top: 12px; display:none;">
      <h3>Screenshot</h3>
      <img id="shot" />
    </div>
  </div>

  <div class="card" style="margin-top: 16px;">
    <h2>2) Visa sida (kringgå iframe-blockering)</h2>
    <div class="row">
      <div style="flex: 2; min-width: 280px;">
        <label>URL att visa</label>
        <input id="iframeUrl" value="https://www7.skatteverket.se/portal/flyttanmalan/" />
      </div>
    </div>
    <div class="row" style="margin-top: 12px; gap: 10px; flex-wrap: wrap;">
      <div>
        <label>Metod</label>
        <select id="viewMode">
          <option value="direct">Direkt iframe</option>
          <option value="proxy">Proxy-läge</option>
          <option value="playwright">Playwright-fönster</option>
        </select>
      </div>
      <div style="align-self: end;">
        <button onclick="openView()">Öppna</button>
      </div>
    </div>
  </div>

<script>
let currentJobId = null;
let pollTimer = null;

function setStatus(obj) {
  const el = document.getElementById("status");
  el.textContent = JSON.stringify(obj, null, 2);
  const wrap = document.getElementById("shotWrap");
  const img = document.getElementById("shot");
  if (obj && obj.screenshot_path) {
    img.src = "/results/" + obj.screenshot_path + "?t=" + Date.now();
    wrap.style.display = "block";
  } else {
    wrap.style.display = "none";
  }
  const running = obj && (obj.state === "running" || obj.state === "queued");
  document.getElementById("startBtn").disabled = running;
  document.getElementById("cancelBtn").disabled = !running;
  document.getElementById("cloneBtn").disabled = !currentJobId;
}

async function startJob() {
  const lineBreak = new RegExp("[\\r\\n]+");
  const clickAfter0 = Number(document.getElementById("clickAfterSeconds0").value || 0);
  const clickSelRaw0 = document.getElementById("clickSelectors0").value.trim();
  const clickSelectors0 = clickSelRaw0 ? clickSelRaw0.split(lineBreak).map(function(s){ return s.trim(); }).filter(Boolean) : [];
  const clickAfter = Number(document.getElementById("clickAfterSeconds").value || 0);
  const clickSelRaw = document.getElementById("clickSelectors").value.trim();
  const clickSelectors = clickSelRaw ? clickSelRaw.split(lineBreak).map(function(s){ return s.trim(); }).filter(Boolean) : [];
  const clickAfter2 = Number(document.getElementById("clickAfterSeconds2").value || 0);
  const clickSelRaw2 = document.getElementById("clickSelectors2").value.trim();
  const clickSelectors2 = clickSelRaw2 ? clickSelRaw2.split(lineBreak).map(function(s){ return s.trim(); }).filter(Boolean) : [];
  const clickAfter3 = Number(document.getElementById("clickAfterSeconds3").value || 0);
  const clickSelRaw3 = document.getElementById("clickSelectors3").value.trim();
  const clickSelectors3 = clickSelRaw3 ? clickSelRaw3.split(lineBreak).map(function(s){ return s.trim(); }).filter(Boolean) : [];

  const payload = {
    url: document.getElementById("targetUrl").value.trim(),
    timeout_seconds: Number(document.getElementById("timeoutSeconds").value || 120),
    click_after_seconds_0: clickAfter0 > 0 ? clickAfter0 : null,
    click_selectors_0: clickAfter0 > 0 && clickSelectors0.length ? clickSelectors0 : null,
    click_after_seconds: clickAfter > 0 ? clickAfter : null,
    click_selectors: clickAfter > 0 && clickSelectors.length ? clickSelectors : null,
    click_after_seconds_2: clickAfter2 > 0 ? clickAfter2 : null,
    click_selectors_2: clickAfter2 > 0 && clickSelectors2.length ? clickSelectors2 : null,
    click_after_seconds_3: clickAfter3 > 0 ? clickAfter3 : null,
    click_selectors_3: clickAfter3 > 0 && clickSelectors3.length ? clickSelectors3 : null,
  };

  const res = await fetch("/api/run", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  currentJobId = data.job_id;
  setStatus(data);

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollStatus, 800);
}

async function pollStatus() {
  if (!currentJobId) return;
  const res = await fetch("/api/status/" + encodeURIComponent(currentJobId));
  const data = await res.json();
  setStatus(data);
  if (["matched","timeout","error","cancelled"].includes(data.state)) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function cancelJob() {
  if (!currentJobId) return;
  await fetch("/api/cancel/" + encodeURIComponent(currentJobId), { method: "POST" });
}

function openView() {
  const url = document.getElementById("iframeUrl").value.trim();
  const mode = document.getElementById("viewMode").value;

  if (mode === "playwright") {
    fetch("/api/open-playwright", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ url }),
    }).then(r => r.json()).then(d => {
      if (d.error) alert(d.error);
    });
    return;
  }

  const targetUrl = mode === "proxy" ? "/iframe?url=" + encodeURIComponent(url) + "&mode=proxy" : "/iframe?url=" + encodeURIComponent(url) + "&mode=direct";
  const w = window.open(targetUrl, "_blank", "noopener,noreferrer,width=1200,height=800");
  if (!w) alert("Popup blockerade fönstret. Tillåt popups för localhost.");
}

function openCloneView() {
  if (!currentJobId) return;
  const targetUrl = "/clone/qr-view/" + encodeURIComponent(currentJobId);
  const w = window.open(targetUrl, "_blank", "noopener,noreferrer,width=560,height=800");
  if (!w) alert("Popup blockerade fönstret. Tillåt popups för localhost.");
}
</script>

</body>
</html>
"""

IFRAME_HTML = """
<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Visa sida</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    header { display:flex; gap:10px; padding: 10px; border-bottom: 1px solid #ddd; align-items:center; }
    input { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #ccc; }
    button { padding: 10px 14px; border-radius: 10px; border: 1px solid #333; background: #111; color:#fff; cursor:pointer; }
    select { padding: 8px; border-radius: 8px; border: 1px solid #ccc; }
    iframe { width: 100%; height: calc(100vh - 62px); border: 0; }
    .small { font-size: 12px; color: #666; padding: 0 10px 10px 10px; }
  </style>
</head>
<body>
  <header>
    <input id="url" placeholder="https://..." />
    <select id="mode">
      <option value="direct">Direkt</option>
      <option value="proxy">Proxy (bypass X-Frame-Options)</option>
    </select>
    <button onclick="go()">Go</button>
  </header>
  <div class="small">Proxy-läge: sidan hämtas via server och blockering tas bort.</div>
  <iframe id="frame"></iframe>

<script>
function go() {
  const u = document.getElementById("url").value.trim();
  const mode = document.getElementById("mode").value;
  const frame = document.getElementById("frame");
  frame.src = (mode === "proxy" && u) ? "/proxy?url=" + encodeURIComponent(u) : (u || "about:blank");
}
const params = new URLSearchParams(window.location.search);
const initial = params.get("url") || "https://example.com";
const modeParam = params.get("mode") || "direct";
document.getElementById("url").value = initial;
document.getElementById("mode").value = modeParam;
go();
</script>
</body>
</html>
"""


@app.get("/")
def index():
    return render_template_string(START_HTML)


@app.get("/flytt")
def flytt_index():
    return render_template_string(INDEX_HTML)


@app.get("/iframe")
def iframe_window():
    return render_template_string(IFRAME_HTML)


@app.get("/results/<path:filename>")
def results(filename: str):
    return send_from_directory(RESULT_DIR, filename)


@app.get("/api/clone/state/<job_id>")
def api_clone_state(job_id: str):
    enabled = _is_clone_qr_to_site_enabled()
    job = _get_job(job_id)
    clone_ctx = _get_clone_qr_context(job_id)

    payload = {
        "ok": True,
        "enabled": enabled,
        "jobId": job_id,
        "jobExists": bool(job),
        "jobState": job.state if job else None,
        "aidPresent": bool(clone_ctx.get("aid")),
        "qrReady": bool(clone_ctx.get("qr_url")),
        "qrImageReady": bool(clone_ctx.get("qr_image_ready")),
        "apiReady": bool(clone_ctx.get("api_ready")),
        "authSpaUrl": clone_ctx.get("auth_spa_url"),
        "qrProxyUrl": f"/api/clone/qr/{job_id}" if clone_ctx.get("qr_url") else None,
    }
    if not enabled:
        payload["ok"] = False
        payload["error"] = "QR clone feature is disabled"
        return jsonify(payload), 403
    return jsonify(payload)


@app.get("/api/clone/qr/<job_id>")
def api_clone_qr(job_id: str):
    if not _is_clone_qr_to_site_enabled():
        return jsonify({"ok": False, "error": "QR clone feature is disabled"}), 403

    clone_ctx = _get_clone_qr_context(job_id)
    aid = (clone_ctx.get("aid") or "").strip()
    if not aid:
        return jsonify({"ok": False, "error": "QR not ready yet for this job"}), 425

    with _log_lock:
        cap = dict(_qr_captured.get(job_id, {}))
    qr_b64 = cap.get("qr_image_base64")
    if qr_b64:
        try:
            img_bytes = base64.b64decode(qr_b64)
        except Exception as e:
            _log_qr_data("QR_CLONE_DECODE_ERROR", {"job_id": job_id, "error": str(e)})
            return jsonify({"ok": False, "error": "Invalid cached QR image"}), 500
        headers = {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        }
        return Response(img_bytes, status=200, headers=headers, content_type="image/png")

    return jsonify({"ok": False, "error": "QR image not captured yet (wait for auth page)"}), 425


@app.post("/api/run")
def api_run():
    active = _count_active_jobs()
    if active >= MAX_CONCURRENT_JOBS:
        return jsonify({
            "error": f"Max {MAX_CONCURRENT_JOBS} samtidiga jobb. {active} körs just nu.",
            "activeJobs": active,
        }), 429

    data = request.get_json(force=True) or {}

    url = (data.get("url") or "").strip()
    timeout_seconds = min(float(data.get("timeout_seconds") or 300), MAX_JOB_RUNTIME_SECONDS)

    job_id = uuid.uuid4().hex[:12]

    # Write payload to a per-job file so parallel jobs don't overwrite each other
    payload = data.get("payload")
    job_payload_file = os.path.join(RUNTIME_DIR, f"payload_{job_id}.json")
    if payload and isinstance(payload, dict):
        try:
            os.makedirs(RUNTIME_DIR, exist_ok=True)
            with open(job_payload_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            with open(DEFAULT_PAYLOAD_FILE, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[api_run] Failed to write payload: {e}")

    def parse_click(key_after, key_selectors):
        after = data.get(key_after)
        sels = data.get(key_selectors)
        if isinstance(sels, list):
            sels = [s for s in sels if s and isinstance(s, str)]
        elif isinstance(sels, str):
            sels = [s.strip() for s in sels.splitlines() if s.strip()]
        else:
            sels = None
        if after is not None:
            after = float(after) if float(after) > 0 else None
        return after, sels

    click_after_0, click_selectors_0 = parse_click("click_after_seconds_0", "click_selectors_0")
    click_after, click_selectors = parse_click("click_after_seconds", "click_selectors")
    click_after_2, click_selectors_2 = parse_click("click_after_seconds_2", "click_selectors_2")
    click_after_3, click_selectors_3 = parse_click("click_after_seconds_3", "click_selectors_3")

    if not url.startswith(("http://", "https://")):
        return jsonify({"error": "URL måste börja med http:// eller https://"}), 400

    job = JobStatus(job_id=job_id, state="queued", message="Köad...")
    _set_job(job)

    t = threading.Thread(
        target=_run_playwright_job,
        args=(job_id, url, timeout_seconds),
        kwargs={
            "click_after_seconds_0": click_after_0,
            "click_selectors_0": click_selectors_0,
            "click_after_seconds": click_after,
            "click_selectors": click_selectors,
            "click_after_seconds_2": click_after_2,
            "click_selectors_2": click_selectors_2,
            "click_after_seconds_3": click_after_3,
            "click_selectors_3": click_selectors_3,
            "payload_file": job_payload_file if payload else None,
        },
        daemon=True,
    )
    t.start()

    body = asdict(job)
    if _is_clone_qr_to_site_enabled():
        body["clone_qr_state_url"] = f"/api/clone/state/{job_id}"
    return jsonify(body)


@app.get("/api/status/<job_id>")
def api_status(job_id: str):
    job = _get_job(job_id)
    if not job:
        return jsonify({"error": "job not found"}), 404
    return jsonify(asdict(job))


@app.post("/api/cancel/<job_id>")
def api_cancel(job_id: str):
    ok = _cancel_job(job_id)
    return jsonify({"ok": ok})


@app.post("/api/click-report")
def api_click_report():
    """Tar emot klick från Playwright-sidan (fetch från injicerad script). Uppdaterar job.details.click_log och last_click."""
    data = request.get_json(force=True, silent=True) or request.form or {}
    job_id = (data.get("job_id") or "").strip()
    if not job_id:
        return jsonify({"ok": False, "error": "missing job_id"}), 400
    job = _get_job(job_id)
    if not job:
        return jsonify({"ok": False, "error": "job not found"}), 404
    tag = (data.get("tag") or "?").lower()
    id_part = (data.get("id") or "").strip()
    if id_part and not id_part.startswith("#"):
        id_part = "#" + id_part
    cls_part = (data.get("cls") or "").strip()
    if cls_part and not cls_part.startswith("."):
        cls_part = "." + cls_part
    text_part = (data.get("text") or "").strip()
    if text_part:
        text_part = ' "' + text_part[:120] + '"'
    left = data.get("left", 0)
    top = data.get("top", 0)
    width = data.get("width", 0)
    height = data.get("height", 0)
    vp = f" [vp: x={data.get('vp_x',0)}% y={data.get('vp_y',0)}% w={data.get('vp_w',0)}% h={data.get('vp_h',0)}%]"
    pg = f" [page: x={data.get('pg_x',0)}% y={data.get('pg_y',0)}% w={data.get('pg_w',0)}% h={data.get('pg_h',0)}%]"
    line = f"{tag}{id_part}{cls_part}{text_part} [x={left}, y={top}, w={width}, h={height}]{vp}{pg}"
    job.details = job.details or {}
    job.details["last_click"] = data
    job.details["click_log"] = job.details.get("click_log", []) + [line]
    _set_job(job)
    return jsonify({"ok": True})


@app.post("/api/open-and-scrape")
def api_open_and_scrape():
    """Starta jobb: öppna URL i Playwright (synligt fönster), logga synliga element (max 500) med koordinater.
    Om search_text anges visas endast element som innehåller den texten (t.ex. 'Logga in', 'State of the Art')."""
    data = request.get_json(force=True) or {}
    url = (data.get("url") or "").strip()
    search_text = (data.get("search_text") or data.get("search") or "").strip() or None
    try:
        wait_seconds = float(data.get("wait_seconds") or 0)
        wait_seconds = max(0.0, min(wait_seconds, 60.0))
    except (TypeError, ValueError):
        wait_seconds = 0.0
    if not url.startswith(("http://", "https://")):
        return jsonify({"error": "URL måste börja med http:// eller https://"}), 400
    active = _count_active_jobs()
    if active >= MAX_CONCURRENT_JOBS:
        return jsonify({"error": f"Max {MAX_CONCURRENT_JOBS} samtidiga jobb."}), 429
    job_id = uuid.uuid4().hex[:12]
    job = JobStatus(job_id=job_id, state="queued", message="Köad...", details={"element_log": []})
    _set_job(job)
    threading.Thread(target=_run_open_url_scrape_job, args=(job_id, url), kwargs={"search_text": search_text, "wait_seconds": wait_seconds}, daemon=True).start()
    return jsonify(asdict(job))


@app.post("/api/fetch-element-at-point")
def api_fetch_element_at_point():
    """Öppna URL i Playwright (headless), vänta på networkidle + extra fördröjning, hämta elementet vid (x, y)."""
    data = request.get_json(force=True) or {}
    url = (data.get("url") or "").strip()
    try:
        x_val = int(data.get("x", 0))
        y_val = int(data.get("y", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "x och y måste vara heltal"}), 400
    try:
        extra_wait = float(data.get("wait_seconds") or 0)
        extra_wait = max(0.0, min(extra_wait, 30.0))
    except (TypeError, ValueError):
        extra_wait = 0.0
    if not url.startswith(("http://", "https://")):
        return jsonify({"error": "URL måste börja med http:// eller https://"}), 400

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                args=["--disable-features=LocalNetworkAccessChecks"],
            )
            page = browser.new_page()
            try:
                page.goto(url, wait_until="networkidle", timeout=60000)
            except Exception:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if extra_wait > 0:
                time.sleep(extra_wait)
            result = page.evaluate(
                """(xy) => {
                    var el = document.elementFromPoint(xy.x, xy.y);
                    if (!el) return { error: 'Inget element vid dessa koordinater' };
                    var r = el.getBoundingClientRect();
                    var vpW = window.innerWidth || 1;
                    var vpH = window.innerHeight || 1;
                    var pageW = Math.max(document.body ? document.body.scrollWidth : vpW, document.documentElement ? document.documentElement.scrollWidth : vpW, vpW);
                    var pageH = Math.max(document.body ? document.body.scrollHeight : vpH, document.documentElement ? document.documentElement.scrollHeight : vpH, vpH);
                    function clamp(v){return Math.max(0,Math.min(100,v));}
                    function pct1(v,b){return Math.round(clamp(v/b*100)*10)/10;}
                    var tag = (el.tagName || '').toLowerCase();
                    var id = el.id || '';
                    var cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\\s+/).slice(0,3).join('.') : '';
                    var text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 200);
                    var left = Math.round(r.left + window.scrollX);
                    var top = Math.round(r.top + window.scrollY);
                    var width = Math.round(r.width);
                    var height = Math.round(r.height);
                    return {
                        tag: tag, id: id, cls: cls, text: text,
                        left: left, top: top, width: width, height: height,
                        href: el.href || (el.getAttribute && el.getAttribute('href')) || '',
                        name: el.name || (el.getAttribute && el.getAttribute('name')) || '',
                        type: el.type || (el.getAttribute && el.getAttribute('type')) || '',
                        vp_x: pct1(left,vpW), vp_y: pct1(top,vpH), vp_w: pct1(width,vpW), vp_h: pct1(height,vpH),
                        pg_x: pct1(left,pageW), pg_y: pct1(top,pageH), pg_w: pct1(width,pageW), pg_h: pct1(height,pageH)
                    };
                }""",
                {"x": x_val, "y": y_val},
            )
            browser.close()
            return jsonify({"ok": True, "element": result, "url": url, "x": x_val, "y": y_val})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/element-at-point")
def api_element_at_point():
    """Sätt koordinatförfrågan för ett körande click-mode-jobb. Worker hämtar element vid (x,y) och sätter element_at_point_result."""
    data = request.get_json(force=True) or {}
    job_id = (data.get("job_id") or "").strip()
    try:
        x_val = int(data.get("x", 0))
        y_val = int(data.get("y", 0))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "x och y måste vara heltal"}), 400
    if not job_id:
        return jsonify({"ok": False, "error": "missing job_id"}), 400
    job = _get_job(job_id)
    if not job:
        return jsonify({"ok": False, "error": "job not found"}), 404
    if job.state != "running":
        return jsonify({"ok": False, "error": "Playwright-fönstret måste vara öppet (kör 'Klicka för elementinfo' först)"}), 400
    job.details = job.details or {}
    job.details["element_at_point_request"] = {"x": x_val, "y": y_val}
    _set_job(job)
    return jsonify({"ok": True})


@app.post("/api/open-click-mode")
def api_open_click_mode():
    """Öppna URL i Playwright (synligt fönster). Klicka på sidan – elementinfo skickas till huvudfönstrets loggfält."""
    data = request.get_json(force=True) or {}
    url = (data.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        return jsonify({"error": "URL måste börja med http:// eller https://"}), 400
    active = _count_active_jobs()
    if active >= MAX_CONCURRENT_JOBS:
        return jsonify({"error": f"Max {MAX_CONCURRENT_JOBS} samtidiga jobb."}), 429
    job_id = uuid.uuid4().hex[:12]
    job = JobStatus(
        job_id=job_id,
        state="queued",
        message="Köad...",
        details={"last_click": None, "click_log": [], "element_log": []},
    )
    _set_job(job)
    threading.Thread(target=_run_click_mode_job, args=(job_id, url), daemon=True).start()
    return jsonify(asdict(job))


def main():
    url = f"http://{APP_HOST}:{APP_PORT}/"
    if not _resolve_headless():
        try:
            webbrowser.open_new(url)
        except Exception:
            pass

    print(f"Server kör på {url} (headless={_resolve_headless()})")
    print("Tryck Ctrl+C för att stoppa.")
    app.run(host=APP_HOST, port=APP_PORT, debug=False, threaded=True)


if __name__ == "__main__":
    main()
