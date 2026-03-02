"""
Int7 BankID flow runner.

Relocated from inlogg/skv_int7.py so int7-specific logic lives in one folder.
"""

import argparse
import json
import os
import sys
import threading
import time
import uuid
from datetime import datetime
from typing import Optional


MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
INLOGG_DIR = os.path.dirname(MODULE_DIR)
RUNTIME_DIR = os.path.join(INLOGG_DIR, "runtime")
DEFAULT_PAYLOAD_FILE = os.path.join(RUNTIME_DIR, "skv_payload_latest.json")
SESSION_LOG_FILE = os.path.join(INLOGG_DIR, "skv_int7_session_log.txt")
JOB_FILE = os.path.join(RUNTIME_DIR, "skv_int7_job.json")

os.makedirs(RUNTIME_DIR, exist_ok=True)

# Ensure legacy modules under inlogg/ are importable when this file is executed directly.
if INLOGG_DIR not in sys.path:
    sys.path.insert(0, INLOGG_DIR)

import skv6


# Keep selectors/timings aligned with skv6 defaults.
CLICK_AFTER_SECONDS_0 = 1.5
CLICK_SELECTORS_0 = [
    "#deny-all",
    "skv-button-8-6-2#deny-all",
    'button:has-text("Tillåt endast nödvändiga")',
    "#accept-all",
]
CLICK_AFTER_SECONDS_1 = 3.0
CLICK_SELECTORS_1 = [
    'a[aria-label*="Inloggning"]',
    "button#login-info-button",
    "slot.fin-skv-button-label",
    "span.fin-skv-button-spinner",
]
CLICK_AFTER_SECONDS_2 = 3.0
CLICK_SELECTORS_2 = [
    "button#bankid-standard",
    "#bankid-standard",
]
CLICK_AFTER_SECONDS_3 = 3.0
CLICK_SELECTORS_3 = [
    "path[fill='#FFFFFF']",
    "path[fill='#000000']",
    "svg path",
]


def _log(message: str, data: Optional[dict] = None) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    with open(SESSION_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] {message}\n")
        if data is not None:
            f.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(message)


def _reset_log() -> None:
    with open(SESSION_LOG_FILE, "w", encoding="utf-8") as f:
        f.write("=" * 60 + "\n")
        f.write(f"  SKV INT7 SESSION  |  {datetime.now().isoformat()}\n")
        f.write("=" * 60 + "\n\n")


def _write_last_payload_snapshot(payload_file: str) -> None:
    if not payload_file or not os.path.isfile(payload_file):
        return
    snapshot_file = os.path.join(RUNTIME_DIR, "last_used_payload.json")
    try:
        with open(payload_file, "r", encoding="utf-8") as src:
            payload = json.load(src)
        with open(snapshot_file, "w", encoding="utf-8") as dst:
            json.dump(payload, dst, ensure_ascii=False, indent=2)
    except Exception as e:
        _log("Failed writing payload snapshot", {"error": str(e)})


def _set_env(temp_env: dict[str, str]) -> dict[str, Optional[str]]:
    previous: dict[str, Optional[str]] = {}
    for key, value in temp_env.items():
        previous[key] = os.environ.get(key)
        os.environ[key] = value
    return previous


def _restore_env(previous: dict[str, Optional[str]]) -> None:
    for key, old_value in previous.items():
        if old_value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = old_value


def _write_job_file(job_id: str, flask_port: int | None = None) -> None:
    """Write current job info so the Next.js API can read it."""
    data = {
        "jobId": job_id,
        "startedAt": datetime.now().isoformat(),
        "pid": os.getpid(),
    }
    if flask_port:
        data["flaskPort"] = flask_port
        data["cloneQrStateUrl"] = f"http://127.0.0.1:{flask_port}/api/clone/state/{job_id}"
    try:
        with open(JOB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        _log("Failed writing job file", {"error": str(e)})


def _port_in_use(port: int) -> bool:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def _start_flask_server(preferred_port: int) -> int:
    """Start skv6 Flask app in a daemon thread. Tries preferred_port, then 8769, 8770."""
    port = preferred_port
    for candidate in [preferred_port, 8769, 8770]:
        if not _port_in_use(candidate):
            port = candidate
            if candidate != preferred_port:
                _log(f"Port {preferred_port} upptagen, använder {port}", {})
            break
    else:
        _log("Alla portar 8767-8770 upptagna, Flask kan inte starta", {})

    def _run():
        try:
            skv6.app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
        except Exception as e:
            _log("Flask server error", {"port": port, "error": str(e)})

    t = threading.Thread(target=_run, daemon=True, name="skv6-flask")
    t.start()
    _log("Flask server startar", {"port": port})
    return port


def run_int7_flow(
    target_url: str,
    payload_file: str,
    timeout_seconds: float,
    allow_mockup_data: bool,
    allow_normal_browser_window: bool,
    force_clone_fallback: bool,
) -> int:
    _reset_log()
    _write_last_payload_snapshot(payload_file)

    clone_enabled = skv6._is_clone_qr_to_site_enabled()
    # Use 8768 for int7 when cloning QR to site, to avoid conflict with standalone skv6.py on 8767
    flask_port = int(os.environ.get("SKV_SERVICE_PORT", "8768" if clone_enabled else "8767"))

    _log(
        "Starting skv_int7 flow",
        {
            "target_url": target_url,
            "payload_file": payload_file,
            "timeout_seconds": timeout_seconds,
            "allow_mockup_data": allow_mockup_data,
            "allow_normal_browser_window": allow_normal_browser_window,
            "force_clone_fallback": force_clone_fallback,
            "clone_qr_to_site": clone_enabled,
            "skv_synligt_skv": os.environ.get("SKV_SYNLIGT_SKV", ""),
        },
    )

    temp_env = {
        "SKV_PAYLOAD_FILE": payload_file,
        "SKV_ALLOW_MOCKUP_DATA": "y" if allow_mockup_data else "n",
        "SKV_DISABLE_NORMAL_BROWSER_WINDOW": "n" if allow_normal_browser_window else "y",
        "SKV_FORCE_CLONE_TAB_FALLBACK": "y" if force_clone_fallback else "n",
    }

    previous_env = _set_env(temp_env)
    try:
        job_id = uuid.uuid4().hex[:12]
        job = skv6.JobStatus(job_id=job_id, state="queued", message="Köad...")
        skv6._set_job(job)

        if clone_enabled:
            flask_port = _start_flask_server(flask_port)
            time.sleep(0.3)
            _write_job_file(job_id, flask_port=flask_port)
        else:
            _write_job_file(job_id)

        skv6._run_playwright_job(
            job_id=job_id,
            url=target_url,
            timeout_seconds=timeout_seconds,
            click_after_seconds_0=CLICK_AFTER_SECONDS_0,
            click_selectors_0=CLICK_SELECTORS_0,
            click_after_seconds=CLICK_AFTER_SECONDS_1,
            click_selectors=CLICK_SELECTORS_1,
            click_after_seconds_2=CLICK_AFTER_SECONDS_2,
            click_selectors_2=CLICK_SELECTORS_2,
            click_after_seconds_3=CLICK_AFTER_SECONDS_3,
            click_selectors_3=CLICK_SELECTORS_3,
        )

        final_job = skv6._get_job(job_id)
        if not final_job:
            _log("skv_int7 finished without final job record")
            return 1

        _log(
            "skv_int7 finished",
            {
                "state": final_job.state,
                "message": final_job.message,
                "screenshot_path": final_job.screenshot_path,
                "details": final_job.details or {},
            },
        )

        if final_job.state == "matched":
            return 0
        return 1
    finally:
        _restore_env(previous_env)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run SKV int7 BankID flow")
    parser.add_argument(
        "--url",
        default="https://www7.skatteverket.se/portal/flyttanmalan/",
        help="Target URL to open",
    )
    parser.add_argument(
        "--payload-file",
        default=os.environ.get("SKV_PAYLOAD_FILE", DEFAULT_PAYLOAD_FILE),
        help="Path to JSON payload used for form fill",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=float(os.environ.get("SKV_INT7_TIMEOUT_SECONDS", "300")),
        help="How long to wait for form detection",
    )
    parser.add_argument(
        "--allow-mockup-data",
        action="store_true",
        help="Allow explicit fallback mockup data if payload is missing",
    )
    parser.add_argument(
        "--allow-normal-browser-window",
        action="store_true",
        help="Allow POPUP_BROWSER_NORMAL_WINDOW behavior in int7 mode",
    )
    parser.add_argument(
        "--no-force-clone-fallback",
        action="store_true",
        help="Disable forced clone fallback for QR tab in int7 mode",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    exit_code = run_int7_flow(
        target_url=args.url,
        payload_file=args.payload_file,
        timeout_seconds=args.timeout_seconds,
        allow_mockup_data=args.allow_mockup_data,
        allow_normal_browser_window=args.allow_normal_browser_window,
        force_clone_fallback=not args.no_force_clone_fallback,
    )
    # Give user-visible browser operations a tiny flush window before process exits.
    time.sleep(0.2)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
