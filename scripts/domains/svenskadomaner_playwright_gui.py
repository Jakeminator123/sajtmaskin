from __future__ import annotations

import functools
import queue
import re
import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox
from typing import Any

import requests
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from godaddy_api import check_domain_availability
from playwright.sync_api import sync_playwright


TARGET_URL = "https://www.svenskadomaner.se/dom%C3%A4nnamn/s%C3%B6kresultat?domain=&resetWorkflow=1"
IANA_RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json"
REQUEST_TIMEOUT = 20


def normalize_domain(value: str) -> str:
    value = value.strip().lower()

    for prefix in ("https://", "http://"):
        if value.startswith(prefix):
            value = value[len(prefix):]

    value = value.split("/")[0]
    value = value.split("?")[0]
    value = value.split("#")[0]

    if value.startswith("www."):
        value = value[4:]

    if "@" in value:
        value = value.split("@", 1)[1]

    return value.strip(".")


def compact_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


@functools.lru_cache(maxsize=1)
def load_rdap_bootstrap() -> dict[str, Any]:
    response = requests.get(IANA_RDAP_BOOTSTRAP_URL, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()


def get_tld(domain: str) -> str:
    parts = domain.split(".")
    if len(parts) < 2:
        raise ValueError(f"Ogiltig domän: {domain}")
    return parts[-1]


def get_rdap_base_url(domain: str) -> str:
    bootstrap = load_rdap_bootstrap()
    tld = get_tld(domain)

    for service in bootstrap.get("services", []):
        if not isinstance(service, list) or len(service) < 2:
            continue

        tlds = service[0] or []
        base_urls = service[1] or []

        if tld in tlds and base_urls:
            base_url = str(base_urls[0])
            if not base_url.endswith("/"):
                base_url += "/"
            return base_url

    raise RuntimeError(f"Hittade ingen RDAP-server för .{tld}")


def get_event_map(events: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for event in events:
        action = event.get("eventAction")
        event_date = event.get("eventDate")
        if action and event_date:
            out[action] = event_date
    return out


def vcard_get(vcard_array: Any, field_name: str) -> list[str]:
    results: list[str] = []

    if not isinstance(vcard_array, list) or len(vcard_array) < 2:
        return results

    items = vcard_array[1]
    if not isinstance(items, list):
        return results

    for item in items:
        if not isinstance(item, list) or len(item) < 4:
            continue
        if item[0] != field_name:
            continue

        value = item[3]
        if isinstance(value, str):
            results.append(value)
        elif isinstance(value, list):
            results.extend(str(x) for x in value)

    return results


def parse_entities(entities: list[dict[str, Any]]) -> dict[str, Any]:
    parsed: dict[str, Any] = {
        "registrar": None,
        "registrant": None,
        "abuse_contact": None,
    }

    for entity in entities:
        roles = entity.get("roles", []) or []
        handle = entity.get("handle")
        vcard = entity.get("vcardArray")

        names = vcard_get(vcard, "fn")
        emails = vcard_get(vcard, "email")
        phones = vcard_get(vcard, "tel")

        info = {
            "handle": handle,
            "name": names[0] if names else None,
            "emails": emails,
            "phones": phones,
            "roles": roles,
        }

        if "registrar" in roles and parsed["registrar"] is None:
            parsed["registrar"] = info

        if "registrant" in roles and parsed["registrant"] is None:
            parsed["registrant"] = info

        if "abuse" in roles and parsed["abuse_contact"] is None:
            parsed["abuse_contact"] = info

    return parsed


def lookup_rdap(domain: str) -> dict[str, Any]:
    try:
        base_url = get_rdap_base_url(domain)
        query_url = f"{base_url}domain/{domain}"

        response = requests.get(
            query_url,
            headers={"Accept": "application/rdap+json, application/json"},
            timeout=REQUEST_TIMEOUT,
        )

        try:
            body = response.json()
        except Exception:
            body = {"raw_text": response.text}

        if response.status_code == 404:
            return {
                "ok": False,
                "registered": False,
                "query_url": query_url,
                "status_code": response.status_code,
                "error": "Domänen verkar inte vara registrerad enligt RDAP.",
            }

        if not response.ok or not isinstance(body, dict):
            return {
                "ok": False,
                "registered": None,
                "query_url": query_url,
                "status_code": response.status_code,
                "error": body,
            }

        events = body.get("events", []) or []
        event_map = get_event_map(events)
        entities = parse_entities(body.get("entities", []) or [])
        registrar = entities.get("registrar") or {}
        registrant = entities.get("registrant") or {}
        nameservers = body.get("nameservers", []) or []

        return {
            "ok": True,
            "registered": True,
            "query_url": query_url,
            "ldh_name": body.get("ldhName"),
            "registrar_name": registrar.get("name"),
            "registrar_handle": registrar.get("handle"),
            "registrar_emails": registrar.get("emails") or [],
            "registrar_phones": registrar.get("phones") or [],
            "registrant_name_public": registrant.get("name"),
            "registrant_emails_public": registrant.get("emails") or [],
            "created": event_map.get("registration"),
            "updated": event_map.get("last changed"),
            "expires": event_map.get("expiration"),
            "status": body.get("status") or [],
            "nameservers": [
                ns.get("ldhName")
                for ns in nameservers
                if isinstance(ns, dict) and ns.get("ldhName")
            ],
        }

    except Exception as exc:
        return {
            "ok": False,
            "registered": None,
            "query_url": None,
            "status_code": None,
            "error": str(exc),
        }


def parse_site_result_from_text(body_text: str, domain: str) -> dict[str, Any]:
    lines = [compact_whitespace(line) for line in body_text.splitlines()]
    lines = [line for line in lines if line]

    domain_pattern = re.compile(rf"(?<![\w.-]){re.escape(domain.lower())}(?![\w.-])")
    candidates: list[dict[str, Any]] = []

    for idx, line in enumerate(lines):
        lower_line = line.lower()
        if not domain_pattern.search(lower_line):
            continue

        context_lines = lines[max(0, idx - 1): min(len(lines), idx + 5)]
        context_text = " | ".join(context_lines)
        context_lower = context_text.lower()

        status = "okänd"
        if "upptagen" in context_lower:
            status = "upptagen"
        elif "ledig" in context_lower or "tillgänglig" in context_lower or "lägg till" in context_lower:
            status = "ledig"

        price_match = re.search(r"(\d+\s*kr)", context_text, flags=re.IGNORECASE)

        candidates.append(
            {
                "matched_line": line,
                "context_lines": context_lines,
                "context_text": context_text,
                "status": status,
                "price": price_match.group(1) if price_match else None,
            }
        )

    if not candidates:
        return {
            "found": False,
            "status": "okänd",
            "matched_line": None,
            "context_lines": [],
            "context_text": None,
            "price": None,
        }

    best = next((c for c in candidates if c["status"] != "okänd"), candidates[0])
    best["found"] = True
    return best


def format_report(
    domain: str,
    site_result: dict[str, Any],
    rdap_result: dict[str, Any],
    godaddy_result: dict[str, Any],
) -> str:
    lines: list[str] = []
    lines.append(f"Domän: {domain}")
    lines.append("")

    lines.append("=== Svenska Domäner ===")
    if site_result.get("found"):
        lines.append(f"Exakt träff hittad: Ja")
        lines.append(f"Status på sidan: {site_result.get('status')}")
        lines.append(f"Pris på raden: {site_result.get('price') or '—'}")
        lines.append(f"Matchad rad: {site_result.get('matched_line') or '—'}")

        context_lines = site_result.get("context_lines") or []
        if context_lines:
            lines.append("")
            lines.append("Närområde i resultatet:")
            for item in context_lines:
                lines.append(f"  - {item}")
    else:
        lines.append("Exakt träff hittad: Nej")
        lines.append("Status på sidan: Kunde inte läsa ut en tydlig rad för exakt domän.")

    lines.append("")
    lines.append("=== RDAP / registreringsinfo ===")

    if rdap_result.get("ok"):
        lines.append("Registrerad: Ja")
        lines.append(f"Registrar: {rdap_result.get('registrar_name') or '—'}")
        lines.append(f"Registrar handle: {rdap_result.get('registrar_handle') or '—'}")

        registrar_emails = rdap_result.get("registrar_emails") or []
        if registrar_emails:
            lines.append(f"Registrar e-post: {', '.join(registrar_emails)}")

        registrar_phones = rdap_result.get("registrar_phones") or []
        if registrar_phones:
            lines.append(f"Registrar telefon: {', '.join(registrar_phones)}")

        lines.append(f"Skapad: {rdap_result.get('created') or '—'}")
        lines.append(f"Uppdaterad: {rdap_result.get('updated') or '—'}")
        lines.append(f"Löper ut: {rdap_result.get('expires') or '—'}")

        registrant_name = rdap_result.get("registrant_name_public")
        if registrant_name:
            lines.append(f"Publik registrant: {registrant_name}")
        else:
            lines.append("Publik registrant: ej publikt synlig")

        registrant_emails = rdap_result.get("registrant_emails_public") or []
        if registrant_emails:
            lines.append(f"Publik registrant e-post: {', '.join(registrant_emails)}")

        status_items = rdap_result.get("status") or []
        if status_items:
            lines.append("Status:")
            for item in status_items:
                lines.append(f"  - {item}")

        nameservers = rdap_result.get("nameservers") or []
        if nameservers:
            lines.append("Nameservers:")
            for ns in nameservers:
                lines.append(f"  - {ns}")

        lines.append(f"RDAP URL: {rdap_result.get('query_url')}")
    else:
        registered = rdap_result.get("registered")
        if registered is False:
            lines.append("Registrerad: Nej / verkar inte registrerad enligt RDAP")
        else:
            lines.append("Registrerad: Okänt")

        lines.append(f"Fel/Info: {rdap_result.get('error')}")
        if rdap_result.get("query_url"):
            lines.append(f"RDAP URL: {rdap_result.get('query_url')}")

    lines.append("")
    lines.append("=== GoDaddy API ===")

    if not godaddy_result.get("configured"):
        lines.append(godaddy_result.get("message") or "GoDaddy API ej konfigurerat.")
    elif godaddy_result.get("ok"):
        available = godaddy_result.get("available")
        if available is True:
            lines.append("Tillgänglig för köp enligt GoDaddy: Ja")
        elif available is False:
            lines.append("Tillgänglig för köp enligt GoDaddy: Nej")
        else:
            lines.append("Tillgänglig för köp enligt GoDaddy: Okänt")

        lines.append(f"Miljö: {str(godaddy_result.get('environment') or '—').upper()}")
        lines.append(f"Definitiv kontroll: {'Ja' if godaddy_result.get('definitive') else 'Nej'}")
        if godaddy_result.get("price_display"):
            lines.append(
                f"Pris: {godaddy_result.get('price_display')} för {godaddy_result.get('period') or 1} år"
            )
        lines.append(f"GoDaddy URL: {godaddy_result.get('query_url')}")
    else:
        lines.append(f"GoDaddy-fel: {godaddy_result.get('message')}")
        if godaddy_result.get("status_code"):
            lines.append(f"HTTP-status: {godaddy_result.get('status_code')}")
        if godaddy_result.get("query_url"):
            lines.append(f"GoDaddy URL: {godaddy_result.get('query_url')}")

    lines.append("")
    lines.append("=== Tolkning ===")

    site_status = site_result.get("status")
    rdap_ok = rdap_result.get("ok")
    rdap_registered = rdap_result.get("registered")

    if site_status == "upptagen":
        lines.append("Svenska Domäner säger att domänen är upptagen.")
    elif site_status == "ledig":
        lines.append("Svenska Domäner verkar visa domänen som ledig.")
    else:
        lines.append("Svenska Domäner gav ingen helt tydlig statusrad.")

    if rdap_ok:
        lines.append("RDAP visar att domänen är registrerad och ger registreringsinfo.")
    elif rdap_registered is False:
        lines.append("RDAP tyder på att domänen inte är registrerad.")
    else:
        lines.append("RDAP gav ingen säker slutsats.")

    if site_status == "upptagen" and rdap_ok:
        lines.append("Sammantaget: domänen är upptagen.")
    elif site_status == "ledig" and rdap_registered is False:
        lines.append("Sammantaget: domänen verkar ledig.")
    else:
        lines.append("Sammantaget: kontrollera manuellt om du vill vara helt säker.")

    return "\n".join(lines)


class BrowserWorker:
    def __init__(self) -> None:
        self.command_queue: queue.Queue[tuple[str, str | None]] = queue.Queue()
        self.message_queue: queue.Queue[dict[str, Any]] = queue.Queue()
        self.thread = threading.Thread(target=self._run, daemon=False)

        self._stop_requested = False

        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.ready = False

    def start(self) -> None:
        self.thread.start()

    def open_page(self) -> None:
        self.command_queue.put(("open", None))

    def search_domain(self, domain: str) -> None:
        self.command_queue.put(("search", domain))

    def stop(self) -> None:
        self.command_queue.put(("stop", None))

    def join(self, timeout: float | None = None) -> None:
        self.thread.join(timeout=timeout)

    def _post_status(self, text: str) -> None:
        self.message_queue.put({"type": "status", "text": text})

    def _post_result(self, text: str) -> None:
        self.message_queue.put({"type": "result", "text": text})

    def _post_error(self, text: str) -> None:
        self.message_queue.put({"type": "error", "text": text})

    def _ensure_browser(self) -> None:
        if self.playwright is None:
            self.playwright = sync_playwright().start()

        if self.browser is None or not self.browser.is_connected():
            self.browser = self.playwright.chromium.launch(headless=False)
            self.context = self.browser.new_context(viewport={"width": 1400, "height": 1000})
            self.page = self.context.new_page()
            self.page.set_default_timeout(15000)
            self.ready = False

        elif self.page is None or self.page.is_closed():
            if self.context is not None:
                try:
                    self.context.close()
                except Exception:
                    pass
            self.context = self.browser.new_context(viewport={"width": 1400, "height": 1000})
            self.page = self.context.new_page()
            self.page.set_default_timeout(15000)
            self.ready = False

    def _accept_cookies_if_present(self) -> bool:
        if self.page is None:
            return False

        selectors = [
            "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
            'button:has-text("Tillåt alla")',
        ]

        for selector in selectors:
            try:
                btn = self.page.locator(selector).first
                btn.wait_for(state="visible", timeout=4000)
                btn.click(timeout=4000)
                return True
            except Exception:
                pass

        return False

    def _open_target_page(self) -> None:
        self._ensure_browser()

        assert self.page is not None

        self._post_status("Öppnar Svenska Domäner...")
        self.page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=60000)

        if self._accept_cookies_if_present():
            self._post_status("Cookiebanner klickad.")

        self.page.wait_for_selector("#Domainsearch", timeout=30000)
        self.page.wait_for_selector("#Domainsearchbutton", timeout=30000)

        self.ready = True
        self._post_status("Redo. Sidan är öppen och sökfältet hittades.")

    def _wait_for_search_result_text(self, domain: str) -> str:
        assert self.page is not None

        deadline = time.time() + 18
        last_text = ""

        try:
            spinner = self.page.locator("#searchingInProgress")
        except Exception:
            spinner = None

        while time.time() < deadline:
            try:
                if spinner is not None:
                    try:
                        if spinner.is_visible():
                            self.page.wait_for_timeout(250)
                            continue
                    except Exception:
                        pass

                try:
                    self.page.wait_for_load_state("networkidle", timeout=1200)
                except Exception:
                    pass

                body_text = self.page.locator("body").inner_text(timeout=3000)
                last_text = body_text

                parsed = parse_site_result_from_text(body_text, domain)
                if parsed.get("found"):
                    return body_text

            except Exception:
                pass

            self.page.wait_for_timeout(500)

        return last_text

    def _perform_search(self, raw_domain: str) -> None:
        domain = normalize_domain(raw_domain)

        if not domain:
            self._post_error("Tom eller ogiltig domän.")
            return

        if not self.ready:
            self._open_target_page()

        assert self.page is not None

        self._post_status(f"Söker på {domain} ...")

        input_box = self.page.locator("#Domainsearch")
        button = self.page.locator("#Domainsearchbutton")

        input_box.click()
        input_box.fill("")
        input_box.fill(domain)
        button.click()

        body_text = self._wait_for_search_result_text(domain)
        site_result = parse_site_result_from_text(body_text, domain)

        self._post_status("Hämtar RDAP-info...")
        rdap_result = lookup_rdap(domain)

        self._post_status("Kontrollerar GoDaddy API...")
        godaddy_result = check_domain_availability(domain)

        report = format_report(domain, site_result, rdap_result, godaddy_result)
        self._post_result(report)
        self._post_status("Klart.")

    def _cleanup(self) -> None:
        self.ready = False

        if self.page is not None:
            try:
                self.page.close()
            except Exception:
                pass
            self.page = None

        if self.context is not None:
            try:
                self.context.close()
            except Exception:
                pass
            self.context = None

        if self.browser is not None:
            try:
                self.browser.close()
            except Exception:
                pass
            self.browser = None

        if self.playwright is not None:
            try:
                self.playwright.stop()
            except Exception:
                pass
            self.playwright = None

    def _run(self) -> None:
        try:
            while not self._stop_requested:
                try:
                    cmd, payload = self.command_queue.get(timeout=0.2)
                except queue.Empty:
                    continue

                if cmd == "open":
                    try:
                        self._open_target_page()
                    except Exception as exc:
                        self.ready = False
                        self._post_error(f"Fel vid sidöppning: {exc}")

                elif cmd == "search":
                    try:
                        self._perform_search(payload or "")
                    except PlaywrightTimeoutError as exc:
                        self.ready = False
                        self._post_error(f"Timeout i browsern: {exc}")
                    except Exception as exc:
                        self.ready = False
                        self._post_error(f"Fel vid sökning: {exc}")

                elif cmd == "stop":
                    self._stop_requested = True

        finally:
            self._cleanup()
            self._post_status("Browser stängd.")


class App:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Svenska Domäner + RDAP")
        self.root.geometry("950x720")

        self.worker = BrowserWorker()
        self.worker.start()

        self.domain_var = tk.StringVar()
        self.status_var = tk.StringVar(value="Startar...")

        self._closing = False

        self._build_ui()
        self._poll_messages()

        self.worker.open_page()

    def _build_ui(self) -> None:
        main = ttk.Frame(self.root, padding=12)
        main.pack(fill="both", expand=True)

        title = ttk.Label(
            main,
            text="Svenska Domäner-sökning + registreringsinfo",
            font=("Segoe UI", 12, "bold"),
        )
        title.pack(anchor="w")

        info = ttk.Label(
            main,
            text=(
                "Skriv t.ex. www.openai.se eller jakob.se. "
                "Skriptet söker på Svenska Domäner, hämtar RDAP-info och använder GoDaddy API om .env är konfigurerad."
            ),
            wraplength=900,
        )
        info.pack(anchor="w", pady=(6, 12))

        row = ttk.Frame(main)
        row.pack(fill="x")

        self.entry = ttk.Entry(row, textvariable=self.domain_var, font=("Segoe UI", 11))
        self.entry.pack(side="left", fill="x", expand=True)
        self.entry.bind("<Return>", lambda event: self.on_search())

        self.search_button = ttk.Button(row, text="Sök", command=self.on_search)
        self.search_button.pack(side="left", padx=(8, 0))

        self.open_button = ttk.Button(row, text="Öppna sidan igen", command=self.on_open)
        self.open_button.pack(side="left", padx=(8, 0))

        quick = ttk.Frame(main)
        quick.pack(fill="x", pady=(10, 8))

        ttk.Button(quick, text="jakob.se", command=lambda: self.quick_search("jakob.se")).pack(side="left")
        ttk.Button(quick, text="www.openai.se", command=lambda: self.quick_search("www.openai.se")).pack(side="left", padx=6)
        ttk.Button(quick, text="openai.com", command=lambda: self.quick_search("openai.com")).pack(side="left")

        status_row = ttk.Frame(main)
        status_row.pack(fill="x", pady=(4, 10))

        ttk.Label(status_row, text="Status:").pack(side="left")
        ttk.Label(status_row, textvariable=self.status_var, foreground="blue").pack(side="left", padx=(6, 0))

        ttk.Label(main, text="Resultat:").pack(anchor="w")

        self.text = tk.Text(main, wrap="word", font=("Consolas", 10))
        self.text.pack(fill="both", expand=True, pady=(6, 0))

        scrollbar = ttk.Scrollbar(self.text, orient="vertical", command=self.text.yview)
        self.text.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")

        self.text.insert(
            "1.0",
            "Väntar på att browsern ska bli redo...\n\n"
            "Tips:\n"
            "- Stäng inte browsern precis när en sökning pågår.\n"
            "- Vill du slippa konsolfönster helt kan du köra filen som .pyw via pyw.\n"
        )

        self.entry.focus_set()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def quick_search(self, domain: str) -> None:
        self.domain_var.set(domain)
        self.on_search()

    def on_open(self) -> None:
        self.worker.open_page()

    def on_search(self) -> None:
        raw = self.domain_var.get().strip()
        if not raw:
            messagebox.showwarning("Saknas", "Skriv in en domän först.")
            return

        self.status_var.set("Köar sökning...")
        self.worker.search_domain(raw)

    def _poll_messages(self) -> None:
        try:
            while True:
                msg = self.worker.message_queue.get_nowait()
                msg_type = msg.get("type")
                text = msg.get("text", "")

                if msg_type == "status":
                    self.status_var.set(text)
                elif msg_type == "result":
                    self.text.delete("1.0", "end")
                    self.text.insert("1.0", text)
                elif msg_type == "error":
                    self.status_var.set("Fel")
                    self.text.insert("end", f"\n\n[Fel]\n{text}\n")
                    self.text.see("end")
        except queue.Empty:
            pass

        if not self._closing:
            self.root.after(150, self._poll_messages)

    def on_close(self) -> None:
        if self._closing:
            return

        self._closing = True
        self.status_var.set("Stänger ned...")
        self.search_button.config(state="disabled")
        self.open_button.config(state="disabled")

        try:
            self.worker.stop()
            self.worker.join(timeout=8)
        except Exception:
            pass

        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()