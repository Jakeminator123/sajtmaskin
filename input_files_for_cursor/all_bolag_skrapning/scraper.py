"""
Allabolag.se scraper — hämtar bolagsfakta för N bolag inom en given bransch.

Sökkällor:
  1. Segmentering — /segmentering?revenueFrom=...&revenueTo=...&companyType=AB&...
     Används när ekonomiska filter (omsättning, resultat, bolagsform, plats) är satta.
     Returnerar bolag som redan matchar filtren server-side.
  2. Bransch-sök  — /bransch-sök?q=keyword
     Används utan filter. Post-filtrering tillämpas i Python.

Datakälla per bolag:
  Varje bolagssida bäddar in <script id="__NEXT_DATA__"> med full JSON-data
  inkl. omsättning, resultat och anställda — gratis utan inloggning.

Skydd: AWS WAF + CloudFront → Playwright med Chrome UA passerar challengen.
"""

import asyncio
import json
import os
import random
import re
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from urllib.parse import urlencode

from playwright.async_api import async_playwright

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def _get_app_dir() -> str:
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "allabolag_scraper")


# Persistent browser path (survives frozen temp extraction)
_BROWSER_DIR = os.path.join(_get_app_dir(), "browsers")
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = _BROWSER_DIR


def _get_pw_cli() -> tuple[str, str]:
    """Return (node_executable, cli.js) — works in both dev and frozen .exe."""
    from playwright._impl._driver import compute_driver_executable
    result = compute_driver_executable()
    # compute_driver_executable returns (node_path, cli_path) in newer versions
    if isinstance(result, (tuple, list)):
        return str(result[0]), str(result[1])
    node = str(result)
    cli = str(Path(node).parent / "package" / "cli.js")
    return node, cli


def ensure_browser(log: Callable[[str], None] = print) -> None:
    """Download Chromium on first launch if missing."""
    marker = Path(_BROWSER_DIR) / ".installed"
    if marker.exists():
        return

    log("[setup] Laddar ner Chromium (engångshämtning, ca 1-2 min) ...")
    env = {**os.environ, "PLAYWRIGHT_BROWSERS_PATH": _BROWSER_DIR}

    # In frozen .exe: sys.executable is the .exe, can't use -m playwright.
    # Always use the bundled Playwright node driver + cli.js instead.
    node, cli = _get_pw_cli()
    try:
        result = subprocess.run(
            [node, cli, "install", "chromium"],
            capture_output=True,
            text=True,
            env=env,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr or result.stdout or "Unknown error")
    except Exception as exc:
        log(f"[setup] Fel vid nedladdning: {exc}")
        raise RuntimeError(
            "Kunde inte ladda ner Chromium. Kontrollera internetanslutningen."
        ) from exc

    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.touch()
    log("[setup] Chromium installerad.")

# ── Standardvärden ────────────────────────────────────────────────────────────
INDUSTRY = "reklambyraer"
NUM_COMPANIES = 10
DELAY_SECONDS = 2.0
OUTPUT_DIR = "output"

BASE_URL = "https://www.allabolag.se"
SEARCH_PATH = "/bransch-s\u00f6k"   # /bransch-sök

_COMPANY_TYPE_MAP = {
    "aktiebolag":          "AB",
    "handelsbolag":        "HB",
    "kommanditbolag":      "KB",
    "enskild firma":       "EF",
    "ekonomisk förening":  "EKON",
    "ideell förening":     "IDEF",
}


# ── Hjälpfunktioner ───────────────────────────────────────────────────────────

async def _accept_cookies(page) -> None:
    try:
        await page.locator('button:has-text("GODKÄNN")').click(timeout=5_000)
        await page.wait_for_timeout(800)
    except Exception:
        pass


def _fmt_orgnr(raw: str) -> str:
    """'5565839460' → '556583-9460'"""
    raw = re.sub(r"\D", "", raw)
    return f"{raw[:6]}-{raw[6:]}" if len(raw) == 10 else raw


def _lookup_proff_code(industry: str) -> str | None:
    """Slår upp proffIndustryCode i branscher.json via sökord."""
    p = Path(__file__).parent / "branscher.json"
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        for b in data:
            if b.get("q", "").lower() == industry.lower():
                return b.get("proffCode")
    except Exception:
        pass
    return None


# ── Sökkälla 1: Segmentering ─────────────────────────────────────────────────

def _build_segmentering_url(filters: dict, industry: str) -> str:
    params: dict[str, str | int] = {}

    ct = (filters.get("company_type") or "").strip()
    if ct and ct.lower() not in ("alla", ""):
        code = _COMPANY_TYPE_MAP.get(ct.lower())
        if code:
            params["companyType"] = code

    if filters.get("revenue_min") is not None:
        params["revenueFrom"] = filters["revenue_min"]
    if filters.get("revenue_max") is not None:
        params["revenueTo"] = filters["revenue_max"]

    if filters.get("profit_min") is not None:
        params["profitFrom"] = filters["profit_min"]
    if filters.get("profit_max") is not None:
        params["profitTo"] = filters["profit_max"]

    if filters.get("emp_min") is not None:
        params["employeesFrom"] = filters["emp_min"]
    if filters.get("emp_max") is not None:
        params["employeesTo"] = filters["emp_max"]

    proff_code = _lookup_proff_code(industry)
    if proff_code:
        params["proffIndustryCode"] = proff_code

    location = (filters.get("location") or "").strip()
    if location:
        params["location"] = location

    return f"{BASE_URL}/segmentering?{urlencode(params)}"


async def _get_company_urls_from_segmentering(
    page, filters: dict, industry: str, limit: int, log: Callable,
) -> list[str]:
    """
    Navigerar till segmenteringssidan med parametrar i URL:en.
    Extraherar org.nr ur bolagskorten i DOM:en (text som "Org.nr556583-9460").
    Scrollar ner för att ladda fler kort vid behov.
    """
    url = _build_segmentering_url(filters, industry)
    log(f"[segmentering] {url}")

    await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    await _accept_cookies(page)
    await page.wait_for_timeout(2_500)

    orgnrs: list[str] = []
    for _ in range(20):
        found: list[str] = await page.evaluate(
            r"""() => {
                const text = document.body.innerText;
                return [...text.matchAll(/Org\.nr\s*(\d{6}-\d{4})/g)].map(m => m[1]);
            }"""
        )

        prev_count = len(orgnrs)
        for nr in found:
            if nr not in orgnrs:
                orgnrs.append(nr)

        if len(orgnrs) >= limit:
            break

        if len(orgnrs) == prev_count:
            # Scroll and wait for more results to load
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(1_500)

            found2: list[str] = await page.evaluate(
                r"""() => {
                    const text = document.body.innerText;
                    return [...text.matchAll(/Org\.nr\s*(\d{6}-\d{4})/g)].map(m => m[1]);
                }"""
            )
            for nr in found2:
                if nr not in orgnrs:
                    orgnrs.append(nr)

            if len(orgnrs) == prev_count:
                break  # no new results after scroll
        else:
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(1_000)

    orgnrs = orgnrs[:limit]

    if not orgnrs:
        raise RuntimeError("Segmenteringen returnerade 0 bolag med dessa filter.")

    log(f"[segmentering] Hittade {len(orgnrs)} bolag")
    return [f"{BASE_URL}/{nr.replace('-', '')}" for nr in orgnrs]


# ── Sökkälla 2: Bransch-sök ──────────────────────────────────────────────────

async def _get_company_urls_from_search(
    page, industry: str, limit: int, log: Callable,
) -> list[str]:
    search_url = f"{BASE_URL}{SEARCH_PATH}?q={industry}"
    log(f"[bransch-sök] {search_url}")
    await page.goto(search_url, wait_until="domcontentloaded", timeout=45_000)
    await page.wait_for_selector('a[href*="/foretag/"]', timeout=15_000)
    await _accept_cookies(page)
    await page.wait_for_timeout(1_000)

    hrefs: list[str] = await page.evaluate(
        f"""() => {{
            const seen = new Set();
            const results = [];
            for (const a of document.querySelectorAll('a[href*="/foretag/"]')) {{
                const href = a.href;
                if (!seen.has(href) && href.split('/').length > 5) {{
                    seen.add(href);
                    results.push(href);
                }}
                if (results.length >= {limit}) break;
            }}
            return results;
        }}"""
    )

    if not hrefs:
        raise RuntimeError(
            f"Hittade inga bolagslänkar för '{industry}'. Prova ett annat sökord."
        )

    log(f"[bransch-sök] Hittade {len(hrefs)} bolag")
    return hrefs


# ── Extraktion av bolagsdata ──────────────────────────────────────────────────

async def _extract_company(page, company_url: str) -> dict:
    await page.goto(company_url, wait_until="domcontentloaded", timeout=45_000)
    await page.wait_for_selector("#__NEXT_DATA__", state="attached", timeout=15_000)
    await page.wait_for_timeout(400)

    raw: dict | None = await page.evaluate(
        "() => { const el = document.querySelector('#__NEXT_DATA__'); "
        "return el ? JSON.parse(el.textContent) : null; }"
    )

    c = (raw or {}).get("props", {}).get("pageProps", {}).get("company", {})
    if not c:
        raise ValueError("__NEXT_DATA__ saknar company-objekt")

    addr = c.get("visitorAddress") or {}
    street   = addr.get("addressLine", "")
    zip_code = addr.get("zipCode", "")
    city     = addr.get("postPlace", "N/A")

    def _int(v):
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    revenue_ksek = _int(c.get("revenue"))
    profit_ksek  = _int(c.get("profit"))
    employees    = _int(c.get("employees"))

    cp = c.get("contactPerson") or {}
    ceo = f"{cp.get('name', '')} ({cp.get('role', '')})" if cp.get("name") else "N/A"

    phone    = c.get("phone") or c.get("legalPhone") or "N/A"
    email    = (c.get("email") or "").strip() or None
    homepage = (c.get("homePage") or "").strip() or None
    mobile   = (c.get("mobile") or c.get("mobile2") or "").strip() or None

    return {
        "name":              c.get("name", "N/A"),
        "orgnr":             _fmt_orgnr(c.get("orgnr", "")),
        "company_type":      (c.get("companyType") or {}).get("name", "N/A"),
        "city":              city,
        "address":           f"{street}, {zip_code} {city}".strip(", "),
        "phone":             phone,
        "email":             email,
        "homepage":          homepage,
        "mobile":            mobile,
        "industries":        [i.get("name", "") for i in (c.get("industries") or [])],
        "nace_codes":        c.get("naceIndustries") or [],
        "revenue_ksek":      revenue_ksek,
        "profit_ksek":       profit_ksek,
        "employees":         employees,
        "ceo":               ceo,
        "registration_date": c.get("registrationDate", "N/A"),
        "purpose":           (c.get("purpose") or "")[:200] or "N/A",
        "url":               page.url,
    }


# ── Post-filtrering (bara för bransch-sök) ────────────────────────────────────

def apply_filters(results: list[dict], filters: dict) -> list[dict]:
    def passes(c: dict) -> bool:
        rev    = c.get("revenue_ksek")
        profit = c.get("profit_ksek")
        emp    = c.get("employees")
        ctype  = c.get("company_type", "")

        checks = [
            ("revenue_min", rev,    lambda v, lim: v >= lim),
            ("revenue_max", rev,    lambda v, lim: v <= lim),
            ("profit_min",  profit, lambda v, lim: v >= lim),
            ("profit_max",  profit, lambda v, lim: v <= lim),
            ("emp_min",     emp,    lambda v, lim: v >= lim),
            ("emp_max",     emp,    lambda v, lim: v <= lim),
        ]
        for key, val, test in checks:
            lim = filters.get(key)
            if lim is not None and val is not None and not test(val, lim):
                return False

        ct = (filters.get("company_type") or "").strip()
        if ct and ct.lower() not in ("alla", ""):
            if ct.lower() not in ctype.lower():
                return False

        return True

    return [c for c in results if passes(c)]


# ── Publik API ────────────────────────────────────────────────────────────────

async def run_scrape(
    industry: str,
    num_companies: int,
    delay: float,
    output_dir: str,
    filters: dict | None = None,
    company_name: str = "",
    separate_files: bool = False,
    headless: bool = True,
    log: Callable[[str], None] = print,
) -> Path:
    """
    Skrapar `num_companies` bolag.

    Prioritet:
      1. company_name — söker specifikt bolag via bransch-sök
      2. Segmentering — om ekonomiska filter är satta
      3. Bransch-sök  — annars
    """
    filters = filters or {}
    company_name = (company_name or "").strip()

    has_financial = any(
        filters.get(k) is not None
        for k in ("revenue_min", "revenue_max", "profit_min", "profit_max", "emp_min", "emp_max")
    )
    has_company_type = (filters.get("company_type") or "").strip() not in ("", "Alla")
    has_location = bool((filters.get("location") or "").strip())
    use_segmentering = not company_name and (has_financial or has_company_type or has_location)

    search_term = company_name or industry

    ensure_browser(log)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            locale="sv-SE",
            viewport={"width": 1280, "height": 900},
        )
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = await context.new_page()

        if company_name:
            log(f"[namnssökning] Söker: {company_name}")
            urls = await _get_company_urls_from_search(
                page, company_name, num_companies, log,
            )
        elif use_segmentering:
            try:
                urls = await _get_company_urls_from_segmentering(
                    page, filters, industry, num_companies, log,
                )
            except RuntimeError as exc:
                log(f"[segmentering] {exc}")
                log("[fallback] Använder bransch-sök istället ...")
                fetch_count = min(num_companies * 5, 50)
                urls = await _get_company_urls_from_search(
                    page, industry, fetch_count, log,
                )
                use_segmentering = False
        else:
            urls = await _get_company_urls_from_search(
                page, industry, num_companies, log,
            )

        results = []
        for i, url in enumerate(urls):
            if i > 0:
                jitter = random.uniform(-0.5, 0.5)
                wait = max(0.5, delay + jitter)
                log(f"[wait]  {wait:.1f}s ...")
                await asyncio.sleep(wait)

            slug = url.split("/")[-1] if "/" in url else url
            log(f"[scrape] ({i + 1}/{len(urls)}) {slug[:40]}")
            try:
                data = await _extract_company(page, url)
                results.append(data)
                rev  = f"{data['revenue_ksek']:,} tkSEK" if data["revenue_ksek"] is not None else "rev N/A"
                prof = f"{data['profit_ksek']:,} tkSEK"  if data["profit_ksek"]  is not None else "res N/A"
                log(f"  \u2713  {data['name']}  |  {data['orgnr']}  |  {rev}  |  {prof}")
            except Exception as exc:
                log(f"  \u2717  Fel: {exc}")

        await browser.close()

    # Post-filtrering (bara vid bransch-sök, segmentering filtrerar server-side)
    if not use_segmentering and filters:
        before = len(results)
        results = apply_filters(results, filters)
        log(f"\n[filter] {len(results)}/{before} bolag passerade filtren")
        if len(results) < before and any(
            filters.get(k) for k in ("revenue_min", "revenue_max", "profit_min", "profit_max")
        ):
            log("[tip] Omsättning/resultat i tusen SEK: 1000 = 1 MSEK, 555 = 555 000 kr")

    results = results[:num_companies]

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    safe_name = re.sub(r"[^\w\-]", "_", search_term)[:40]

    # Alltid: spara kombinerad fil
    filename = out / f"{safe_name}_{ts}.json"
    filename.write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log(f"[done] {len(results)} bolag sparade \u2192 {filename}")

    # Valfritt: spara varje bolag som egen fil
    if separate_files and results:
        ind_dir = out / f"{safe_name}_{ts}"
        ind_dir.mkdir(exist_ok=True)
        for c in results:
            orgnr_safe = c.get("orgnr", "unknown").replace("-", "")
            name_safe = re.sub(r"[^\w\-]", "_", c.get("name", ""))[:50]
            f = ind_dir / f"{name_safe}_{orgnr_safe}.json"
            f.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding="utf-8")
        log(f"[done] {len(results)} separata filer \u2192 {ind_dir}")

    return filename


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    asyncio.run(
        run_scrape(
            industry=INDUSTRY,
            num_companies=NUM_COMPANIES,
            delay=DELAY_SECONDS,
            output_dir=OUTPUT_DIR,
        )
    )
