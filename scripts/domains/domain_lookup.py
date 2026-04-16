from __future__ import annotations

import json
import threading
import tkinter as tk
from tkinter import ttk, messagebox
from typing import Any

import requests

from godaddy_api import check_domain_availability


TIMEOUT = 20
IANA_RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json"


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


def get_tld(domain: str) -> str:
    parts = domain.split(".")
    if len(parts) < 2:
        raise ValueError(f"Ogiltig domän: {domain}")
    return parts[-1]


def load_rdap_bootstrap() -> dict[str, Any]:
    response = requests.get(IANA_RDAP_BOOTSTRAP_URL, timeout=TIMEOUT)
    response.raise_for_status()
    return response.json()


def get_rdap_base_url(domain: str, bootstrap_data: dict[str, Any]) -> str:
    tld = get_tld(domain)
    services = bootstrap_data.get("services", [])

    for service in services:
        if not isinstance(service, list) or len(service) < 2:
            continue

        tlds = service[0] or []
        base_urls = service[1] or []

        if tld in tlds and base_urls:
            base_url = str(base_urls[0])
            if not base_url.endswith("/"):
                base_url += "/"
            return base_url

    raise RuntimeError(f"Hittade ingen RDAP-server för TLD '.{tld}'")


def fetch_rdap_domain(domain: str, bootstrap_data: dict[str, Any]) -> dict[str, Any]:
    base_url = get_rdap_base_url(domain, bootstrap_data)
    url = f"{base_url}domain/{domain}"

    response = requests.get(
        url,
        headers={"Accept": "application/rdap+json, application/json"},
        timeout=TIMEOUT,
    )

    try:
        body = response.json()
    except Exception:
        body = {"raw_text": response.text}

    return {
        "ok": response.ok,
        "status_code": response.status_code,
        "query_url": url,
        "body": body,
    }


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
        if item[0] == field_name:
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
        name = names[0] if names else None

        emails = vcard_get(vcard, "email")
        phones = vcard_get(vcard, "tel")

        info = {
            "handle": handle,
            "name": name,
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


def detect_provider_name(registrar_name: str | None) -> str | None:
    if not registrar_name:
        return None

    low = registrar_name.lower()

    if "godaddy" in low:
        return "GoDaddy"
    if "namecheap" in low:
        return "Namecheap"
    if "markmonitor" in low:
        return "MarkMonitor"
    if "tucows" in low:
        return "Tucows"
    if "enom" in low:
        return "eNom"
    if "ovh" in low:
        return "OVH"
    if "cloudflare" in low:
        return "Cloudflare"
    if "network solutions" in low:
        return "Network Solutions"

    return registrar_name


def summarize_rdap(domain: str, rdap_result: dict[str, Any]) -> dict[str, Any]:
    if not rdap_result.get("ok"):
        return {
            "domain": domain,
            "ok": False,
            "status_code": rdap_result.get("status_code"),
            "query_url": rdap_result.get("query_url"),
            "error": rdap_result.get("body"),
        }

    body = rdap_result["body"]
    events = body.get("events", []) or []
    event_map = get_event_map(events)
    nameservers = body.get("nameservers", []) or []
    entities = parse_entities(body.get("entities", []) or [])
    registrar = entities.get("registrar") or {}

    registrar_name = registrar.get("name")
    provider_name = detect_provider_name(registrar_name)

    summary = {
        "domain": body.get("ldhName") or domain,
        "query_url": rdap_result.get("query_url"),
        "provider_guess": provider_name,
        "registrar_name": registrar_name,
        "registrar_handle": registrar.get("handle"),
        "registrar_emails": registrar.get("emails"),
        "registrar_phones": registrar.get("phones"),
        "registrant_name_public": (entities.get("registrant") or {}).get("name"),
        "registrant_emails_public": (entities.get("registrant") or {}).get("emails"),
        "created": event_map.get("registration"),
        "updated": event_map.get("last changed"),
        "expires": event_map.get("expiration"),
        "status": body.get("status"),
        "nameservers": [
            ns.get("ldhName")
            for ns in nameservers
            if isinstance(ns, dict) and ns.get("ldhName")
        ],
        "ok": True,
    }

    return summary


def format_godaddy_summary(result: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    lines.append("GoDaddy availability:")

    if not result.get("configured"):
        lines.append(f"  - Status: {result.get('message')}")
        return lines

    lines.append(f"  - Miljö: {str(result.get('environment') or '—').upper()}")

    if result.get("ok"):
        available = result.get("available")
        if available is True:
            status = "ledig för köp enligt GoDaddy"
        elif available is False:
            status = "inte ledig för köp enligt GoDaddy"
        else:
            status = "okänd"

        lines.append(f"  - Status: {status}")
        lines.append(f"  - Definitiv kontroll: {'Ja' if result.get('definitive') else 'Nej'}")
        if result.get("price_display"):
            lines.append(f"  - Pris: {result.get('price_display')} för {result.get('period') or 1} år")
        lines.append(f"  - URL: {result.get('query_url')}")
        return lines

    lines.append(f"  - Status: API-fel ({result.get('status_code') or '—'})")
    if result.get("message"):
        lines.append(f"  - Info: {result.get('message')}")
    if result.get("query_url"):
        lines.append(f"  - URL: {result.get('query_url')}")
    return lines


def format_summary(summary: dict[str, Any], godaddy_result: dict[str, Any] | None = None) -> str:
    if not summary.get("ok"):
        return (
            f"Domän: {summary.get('domain')}\n"
            f"Status: Kunde inte läsa RDAP-data\n"
            f"HTTP-status: {summary.get('status_code')}\n"
            f"RDAP URL: {summary.get('query_url')}\n\n"
            f"Fel:\n{json.dumps(summary.get('error'), indent=2, ensure_ascii=False)}"
        )

    lines: list[str] = []
    lines.append(f"Domän: {summary.get('domain')}")
    lines.append(f"Registrar / leverantör: {summary.get('registrar_name') or 'Okänd'}")
    lines.append(f"Tolkad leverantör: {summary.get('provider_guess') or 'Okänd'}")
    lines.append(f"Registrar handle: {summary.get('registrar_handle') or '—'}")
    lines.append(f"Skapad: {summary.get('created') or '—'}")
    lines.append(f"Uppdaterad: {summary.get('updated') or '—'}")
    lines.append(f"Löper ut: {summary.get('expires') or '—'}")

    registrant_name = summary.get("registrant_name_public")
    if registrant_name:
        lines.append(f"Publik registrant/ägare: {registrant_name}")
    else:
        lines.append("Publik registrant/ägare: ej publikt synlig")

    registrar_emails = summary.get("registrar_emails") or []
    if registrar_emails:
        lines.append(f"Registrar e-post: {', '.join(registrar_emails)}")

    registrant_emails = summary.get("registrant_emails_public") or []
    if registrant_emails:
        lines.append(f"Publik registrant e-post: {', '.join(registrant_emails)}")

    status = summary.get("status") or []
    if status:
        lines.append("")
        lines.append("Status:")
        for item in status:
            lines.append(f"  - {item}")

    nameservers = summary.get("nameservers") or []
    if nameservers:
        lines.append("")
        lines.append("Nameservers:")
        for ns in nameservers:
            lines.append(f"  - {ns}")

    lines.append("")
    lines.append(f"RDAP URL: {summary.get('query_url')}")

    if godaddy_result is not None:
        lines.append("")
        lines.extend(format_godaddy_summary(godaddy_result))

    return "\n".join(lines)


class DomainLookupApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Domain Lookup")
        self.root.geometry("900x700")

        self.bootstrap_data: dict[str, Any] | None = None

        self.domain_var = tk.StringVar()

        self._build_ui()
        self._load_bootstrap_async()

    def _build_ui(self) -> None:
        top = ttk.Frame(self.root, padding=12)
        top.pack(fill="x")

        ttk.Label(top, text="Domän eller URL:").pack(anchor="w")

        row = ttk.Frame(top)
        row.pack(fill="x", pady=(6, 0))

        self.entry = ttk.Entry(row, textvariable=self.domain_var, font=("Segoe UI", 11))
        self.entry.pack(side="left", fill="x", expand=True)
        self.entry.bind("<Return>", lambda event: self.lookup_domain())

        self.search_button = ttk.Button(row, text="Sök", command=self.lookup_domain)
        self.search_button.pack(side="left", padx=(8, 0))

        quick = ttk.Frame(top)
        quick.pack(fill="x", pady=(10, 0))

        ttk.Button(quick, text="openai.com", command=lambda: self.set_and_lookup("openai.com")).pack(side="left")
        ttk.Button(quick, text="godaddy.com", command=lambda: self.set_and_lookup("godaddy.com")).pack(side="left", padx=6)
        ttk.Button(quick, text="www.dg97.com", command=lambda: self.set_and_lookup("www.dg97.com")).pack(side="left")

        self.status_label = ttk.Label(top, text="Laddar RDAP-bootstrap...", foreground="blue")
        self.status_label.pack(anchor="w", pady=(10, 0))

        result_frame = ttk.Frame(self.root, padding=(12, 0, 12, 12))
        result_frame.pack(fill="both", expand=True)

        self.text = tk.Text(result_frame, wrap="word", font=("Consolas", 10))
        self.text.pack(side="left", fill="both", expand=True)

        scroll = ttk.Scrollbar(result_frame, orient="vertical", command=self.text.yview)
        scroll.pack(side="right", fill="y")
        self.text.configure(yscrollcommand=scroll.set)

        self.text.insert("1.0", "Skriv in en domän, t.ex. www.dg97.com, och tryck Sök.\nOm .env innehåller GoDaddy-nycklar görs även en availability-koll via GoDaddy API.\n")
        self.entry.focus_set()

    def set_status(self, text: str, color: str = "black") -> None:
        self.status_label.config(text=text, foreground=color)

    def set_and_lookup(self, value: str) -> None:
        self.domain_var.set(value)
        self.lookup_domain()

    def _load_bootstrap_async(self) -> None:
        def worker() -> None:
            try:
                data = load_rdap_bootstrap()
                self.root.after(0, lambda: self._on_bootstrap_loaded(data))
            except Exception as exc:
                self.root.after(0, lambda: self._on_bootstrap_error(exc))

        threading.Thread(target=worker, daemon=True).start()

    def _on_bootstrap_loaded(self, data: dict[str, Any]) -> None:
        self.bootstrap_data = data
        self.set_status("Redo.", "green")

    def _on_bootstrap_error(self, exc: Exception) -> None:
        self.set_status("Kunde inte ladda RDAP-bootstrap.", "red")
        messagebox.showerror("Fel", f"Kunde inte ladda RDAP-bootstrap:\n{exc}")

    def lookup_domain(self) -> None:
        raw = self.domain_var.get().strip()
        if not raw:
            messagebox.showwarning("Saknas", "Skriv in en domän först.")
            return

        if not self.bootstrap_data:
            messagebox.showwarning("Ej redo", "RDAP-bootstrap är inte laddad ännu.")
            return

        domain = normalize_domain(raw)
        self.text.delete("1.0", "end")
        self.text.insert("1.0", f"Söker på: {domain}\n\n")
        self.set_status("Söker...", "blue")
        self.search_button.config(state="disabled")

        def worker() -> None:
            try:
                rdap_result = fetch_rdap_domain(domain, self.bootstrap_data)
                godaddy_result = check_domain_availability(domain)
                summary = summarize_rdap(domain, rdap_result)
                output = format_summary(summary, godaddy_result)
                self.root.after(0, lambda: self._show_result(output))
            except Exception as exc:
                self.root.after(0, lambda: self._show_error(exc))

        threading.Thread(target=worker, daemon=True).start()

    def _show_result(self, output: str) -> None:
        self.text.delete("1.0", "end")
        self.text.insert("1.0", output)
        self.set_status("Klart.", "green")
        self.search_button.config(state="normal")

    def _show_error(self, exc: Exception) -> None:
        self.text.delete("1.0", "end")
        self.text.insert("1.0", f"Fel:\n{exc}")
        self.set_status("Fel vid sökning.", "red")
        self.search_button.config(state="normal")


def main() -> None:
    root = tk.Tk()
    app = DomainLookupApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()