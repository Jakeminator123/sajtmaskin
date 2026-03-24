import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional, Dict, Tuple
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://vercel.com"
TEMPLATES_URL = f"{BASE_URL}/templates"

# Kärn-use-cases — anpassade för Sajtmaskin (Next/React-landningssajt, SaaS-ytor, handel, innehåll).
# Dokumentation + monorepos är ofta brus / undantag — lägg till med --extended-scrape.
USE_CASES_CORE: List[Tuple[str, str]] = [
    ("marketing-sites", "Marketing Sites"),
    ("starter", "Starter"),
    ("saas", "SaaS"),
    ("ecommerce", "Ecommerce"),
    ("blog", "Blog"),
    ("portfolio", "Portfolio"),
    ("cms", "CMS"),
    ("authentication", "Authentication"),
    ("admin-dashboard", "Admin Dashboard"),
    ("multi-tenant-apps", "Multi-Tenant Apps"),
    ("ai", "AI"),
    ("realtime-apps", "Realtime Apps"),
]

USE_CASES_EXTENDED: List[Tuple[str, str]] = [
    ("documentation", "Documentation"),
    ("monorepos", "Monorepos"),
]

# Bakåtkompatibilitet: äldre namn i importer / externa skript.
USE_CASES: List[Tuple[str, str]] = USE_CASES_CORE + USE_CASES_EXTENDED

# Undermappar per malltyp (standard, ej --flat-layout).
ARTIFACT_TIER_FULL_REPO = "full-repo"
ARTIFACT_TIER_TUTORIAL = "tutorial-bootstrap"
ARTIFACT_TIER_MONOREPO = "monorepo-examples"

# Framework-filter: bara Next.js/React-mallar hämtas.
FRAMEWORK_FILTER: List[str] = ["next.js", "react"]

# CSS-tekniker att spara som metadata-signal per mall (inte ett filter-gate).
CSS_TAGS_OF_INTEREST: List[str] = [
    "tailwind",
    "radix-ui",
    "css-modules",
    "css-in-jsx",
    "material-ui",
    "styled-components",
    "chakra",
]

# Vanliga exempel från dokumentation / manuell körning (direkt-URL-läge → …/direct-urls/<slug>/)
CANONICAL_TEMPLATE_URLS: List[str] = [
    "https://vercel.com/templates/next.js/nextjs-boilerplate",
    "https://vercel.com/templates/saas/platforms-starter-kit",
    "https://vercel.com/templates/ecommerce/nextjs-commerce",
]

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,sv;q=0.8",
}


IMPORTANT_KEYWORDS = [
    "feature",
    "features",
    "getting started",
    "installation",
    "install",
    "deploy",
    "deployment",
    "configure",
    "configuration",
    "environment",
    "env",
    "variables",
    "oauth",
    "auth",
    "authentication",
    "stripe",
    "supabase",
    "webhook",
    "database",
    "postgres",
    "postgresql",
    "redis",
    "mongodb",
    "mysql",
    "local",
    "develop locally",
    "run locally",
    "running locally",
    "running the server",
    "running",
    "setup",
    "set up",
    "cli",
    "vercel",
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "next_public_",
    "secret_key",
    "api key",
    "api keys",
    "api endpoint",
    "redeploy",
]


COMMAND_PREFIXES = (
    "npm ",
    "pnpm ",
    "yarn ",
    "bun ",
    "vercel ",
    "git ",
    "stripe ",
    "npx ",
    "node ",
)

# Första träffen på github.com/vercel/vercel är ofta sidfot / global UI, inte mallens repo.
_GITHUB_REPO_RE = re.compile(
    r"https?://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/?",
    re.I,
)
# Första två path-segmenten efter github.com (för klonbar bas-URL, utan /tree/, /blob/, #anchor)
_GITHUB_CLONE_BASE_RE = re.compile(
    r"^https?://github\.com/([^/]+)/([^/#?]+)",
    re.I,
)
_VERCEL_TEMPLATE_PATH_RE = re.compile(
    r"^https?://vercel\.com/templates/([^/]+)/([^/?#]+)/?$",
    re.I,
)


def normalize_github_clone_url(url: Optional[str]) -> Optional[str]:
    """
    Gör om GitHub-webblänkar (…/tree/branch/path, …/blob/…, #fragment) till en URL
    som `git clone` accepterar: https://github.com/owner/repo
    Returnerar None om länken inte ser ut som ett repo.
    """
    if not url:
        return None
    u = url.strip()
    if "github.com" not in u.lower():
        return None
    u = u.split("#")[0].split("?")[0].strip()
    m = _GITHUB_CLONE_BASE_RE.match(u)
    if not m:
        return None
    owner, repo = m.group(1), m.group(2)
    if repo.lower().endswith(".git"):
        repo = repo[:-4]
    # Reject non-repo GitHub paths (attachments, avatars, raw content, etc.)
    reject_owners = {"user-attachments", "avatars", "raw", "objects", "assets", "settings", "orgs", "organizations"}
    if owner.lower() in reject_owners:
        return None
    return f"https://github.com/{owner}/{repo}"


def _walk_json_for_github_urls(obj: object) -> List[str]:
    """Hitta github-URL:er i JSON-LD m.m. (codeRepository, url, …)."""
    found: List[str] = []
    if isinstance(obj, dict):
        for key, val in obj.items():
            lk = key.lower()
            if lk in ("coderepository", "repository", "sameas") and isinstance(val, str):
                if "github.com" in val.lower():
                    found.append(val.split("?")[0].rstrip("/"))
            elif lk == "url" and isinstance(val, str) and "github.com" in val.lower():
                found.append(val.split("?")[0].rstrip("/"))
            found.extend(_walk_json_for_github_urls(val))
    elif isinstance(obj, list):
        for item in obj:
            found.extend(_walk_json_for_github_urls(item))
    return found


def dir_size_bytes(path: Path) -> int:
    if not path.is_dir():
        return 0
    total = 0
    for p in path.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


MONOREPO_EXAMPLE_REPOS = {
    "vercel/next.js",
    "vercel/vercel",
    "vercel/examples",
    "vercel/turborepo",
    "vercel/firewall-templates",
}


@dataclass
class TemplateInfo:
    category_slug: str
    category_name: str
    template_url: str
    title: str
    description: str
    repo_url: Optional[str]
    demo_url: Optional[str]
    framework_match: bool
    framework_reason: str
    stack_tags: List[str]
    css_tags: List[str]
    use_case_badges: List[str]
    database_badges: List[str]
    auth_badges: List[str]
    is_monorepo_example: bool
    is_tutorial_template: bool
    important_lines: List[str]
    # Sätts i run_scrape innan persist (full-repo | tutorial-bootstrap | monorepo-examples).
    artifact_tier: str = ""


def assign_artifact_tier(template: TemplateInfo) -> None:
    if template.is_monorepo_example:
        template.artifact_tier = ARTIFACT_TIER_MONOREPO
    elif template.is_tutorial_template:
        template.artifact_tier = ARTIFACT_TIER_TUTORIAL
    else:
        template.artifact_tier = ARTIFACT_TIER_FULL_REPO


def template_output_dir(
    root: Path,
    template: TemplateInfo,
    flat_layout: bool,
    *,
    direct_slug: Optional[str] = None,
) -> Path:
    """Katalog för en mall: antingen flat (gammalt läge) eller tier/kategori/titel."""
    folder = safe_folder_name(direct_slug) if direct_slug else safe_folder_name(template.title)
    cat = "direct-urls" if direct_slug is not None else template.category_slug
    if flat_layout:
        return root / cat / folder
    return root / template.artifact_tier / cat / folder


def active_use_cases(extended: bool) -> List[Tuple[str, str]]:
    if extended:
        return list(USE_CASES_CORE) + list(USE_CASES_EXTENDED)
    return list(USE_CASES_CORE)


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^\w\s\-\.]+", "", value)
    value = value.replace(".", "-")
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"-{2,}", "-", value)
    return value.strip("-")


def safe_folder_name(value: str) -> str:
    value = slugify(value)
    value = re.sub(r'[<>:"/\\\\|?*]+', "", value)
    return value[:120] if len(value) > 120 else value


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


class VercelTemplateScraper:
    def __init__(
        self,
        timeout: int = 30,
        delay: float = 0.4,
        loose_framework_match: bool = False,
    ):
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.timeout = timeout
        self.delay = delay
        self.loose_framework_match = loose_framework_match

    def get_html(self, url: str) -> Optional[str]:
        try:
            resp = self.session.get(url, timeout=self.timeout)
            resp.raise_for_status()
            time.sleep(self.delay)
            return resp.text
        except requests.RequestException as exc:
            print(f"[WARN] Kunde inte hämta {url}: {exc}")
            return None

    def get_soup(self, url: str) -> Optional[BeautifulSoup]:
        html = self.get_html(url)
        if not html:
            return None
        return BeautifulSoup(html, "html.parser")

    def get_category_template_urls(self, category_slug: str) -> List[str]:
        """
        Hämtar alla template-URL:er från en use-case-sida, filtrerade på FRAMEWORK_FILTER.

        Vercel listar starters med slug "starter" men mallens faktiska href pekar ofta
        till /templates/next.js/… eller /templates/saas/…  — därför matchar vi alla
        /templates/<segment>/<slug> på den sidan, inte bara samma segment som kategorin.
        """
        fw_params = "&".join(f"framework={fw}" for fw in FRAMEWORK_FILTER)
        url = f"{TEMPLATES_URL}/{category_slug}?{fw_params}"
        soup = self.get_soup(url)
        if not soup:
            return []

        href_pattern = re.compile(r"^/templates/[^/]+/[^/]+/?$")
        urls: List[str] = []
        seen = set()

        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href_pattern.match(href):
                continue
            full_url = urljoin(BASE_URL, href)
            if full_url not in seen:
                seen.add(full_url)
                urls.append(full_url)

        return urls

    def parse_detail_page(self, category_slug: str, category_name: str, template_url: str) -> Optional[TemplateInfo]:
        soup = self.get_soup(template_url)
        if not soup:
            return None

        page_text = self.extract_page_text(soup)
        title = self.extract_title(soup)
        description = self.extract_description(soup)
        repo_url = self.extract_repo_url(soup)
        demo_url = self.extract_demo_url(soup)
        stack_tags = self.extract_stack_tags(soup)
        css_tags = self.extract_css_tags(stack_tags, page_text)
        use_case_badges = self.extract_sidebar_badges(soup, "Use Cases")
        database_badges = self.extract_sidebar_badges(soup, "Database")
        auth_badges = self.extract_sidebar_badges(soup, "Authentication")
        is_monorepo = self.detect_monorepo_example(repo_url)
        is_tutorial = self.detect_tutorial_template(page_text, repo_url)
        fw_fn = (
            self.is_next_or_react_loose
            if self.loose_framework_match
            else self.is_next_or_react
        )
        framework_match, framework_reason = fw_fn(title, description, page_text, stack_tags)
        important_lines = self.extract_important_lines(page_text)

        return TemplateInfo(
            category_slug=category_slug,
            category_name=category_name,
            template_url=template_url,
            title=title,
            description=description,
            repo_url=repo_url,
            demo_url=demo_url,
            framework_match=framework_match,
            framework_reason=framework_reason,
            stack_tags=stack_tags,
            css_tags=css_tags,
            use_case_badges=use_case_badges,
            database_badges=database_badges,
            auth_badges=auth_badges,
            is_monorepo_example=is_monorepo,
            is_tutorial_template=is_tutorial,
            important_lines=important_lines,
        )

    @staticmethod
    def extract_title(soup: BeautifulSoup) -> str:
        h1 = soup.find("h1")
        if h1:
            return " ".join(h1.get_text(" ", strip=True).split())

        og_title = soup.find("meta", attrs={"property": "og:title"})
        if og_title and og_title.get("content"):
            return og_title["content"].strip()

        title_tag = soup.find("title")
        if title_tag:
            return " ".join(title_tag.get_text(" ", strip=True).split())

        return "Okänd titel"

    @staticmethod
    def extract_description(soup: BeautifulSoup) -> str:
        og_desc = soup.find("meta", attrs={"property": "og:description"})
        if og_desc and og_desc.get("content"):
            return og_desc["content"].strip()

        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            return meta_desc["content"].strip()

        # Försök hitta första vettiga paragraph efter h1
        h1 = soup.find("h1")
        if h1:
            for sib in h1.find_all_next(["p", "div"], limit=10):
                text = " ".join(sib.get_text(" ", strip=True).split())
                if len(text) > 20:
                    return text

        return ""

    @staticmethod
    def extract_page_text(soup: BeautifulSoup) -> str:
        # Ta bort script/style
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()

        text = soup.get_text("\n", strip=True)
        lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
        lines = [line for line in lines if line]
        return "\n".join(lines)

    @staticmethod
    def extract_repo_url(soup: BeautifulSoup) -> Optional[str]:
        def normalize_href(h: str) -> str:
            return h.strip().split("?")[0].rstrip("/")

        chosen: Optional[str] = None

        # 1) JSON-LD (ofta codeRepository) — minskar risk för fel första <a>-träff
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            raw = script.string or script.get_text() or ""
            if not raw.strip():
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            candidates = _walk_json_for_github_urls(data)
            for c in candidates:
                if _GITHUB_REPO_RE.search(c):
                    chosen = normalize_href(c)
                    break
            if chosen:
                break

        # 2) Ankare med tydlig GitHub-etikett
        if not chosen:
            labeled: List[Tuple[str, str]] = []
            for a in soup.find_all("a", href=True):
                text = a.get_text(" ", strip=True).lower()
                href = normalize_href(a["href"])
                if "github.com" not in href:
                    continue
                if not _GITHUB_REPO_RE.search(href):
                    continue
                labeled.append((href, text))
                if "github repo" in text:
                    chosen = href
                    break

        # 3) Samla alla github owner/repo-länkar; undvik github.com/vercel/vercel om det finns alternativ
        if not chosen:
            repos = [h for h, _ in labeled] if labeled else []
            if not repos:
                for a in soup.find_all("a", href=True):
                    href = normalize_href(a["href"])
                    if "github.com" in href and _GITHUB_REPO_RE.search(href):
                        repos.append(href)

            if repos:
                dedup: List[str] = []
                seen = set()
                for h in repos:
                    low = h.lower()
                    if low not in seen:
                        seen.add(low)
                        dedup.append(h)

                non_v_self = [h for h in dedup if "github.com/vercel/vercel" not in h.lower()]
                chosen = non_v_self[0] if non_v_self else dedup[0]

        return normalize_github_clone_url(chosen)

    @staticmethod
    def extract_demo_url(soup: BeautifulSoup) -> Optional[str]:
        for a in soup.find_all("a", href=True):
            text = a.get_text(" ", strip=True).lower()
            href = a["href"].strip()
            if "view demo" in text:
                return href
        return None

    @staticmethod
    def extract_stack_tags(soup: BeautifulSoup) -> List[str]:
        tags: List[str] = []
        raw_text = soup.get_text("\n", strip=True)
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

        # Enkel heuristik: hitta "Stack" och ta några rader efteråt
        for idx, line in enumerate(lines):
            if line.lower() == "stack":
                for candidate in lines[idx + 1 : idx + 8]:
                    if len(candidate) <= 40:
                        tags.append(candidate)
                break

        # Rensa dubletter
        out = []
        seen = set()
        for tag in tags:
            norm = tag.lower()
            if norm not in seen:
                seen.add(norm)
                out.append(tag)
        return out

    @staticmethod
    def extract_css_tags(stack_tags: List[str], page_text: str) -> List[str]:
        """Match known CSS frameworks from stack tags and page text."""
        haystack = " ".join(stack_tags).lower() + " " + page_text[:8000].lower()
        found: List[str] = []
        for css in CSS_TAGS_OF_INTEREST:
            normalized = css.replace("-", " ").replace("_", " ")
            if normalized in haystack or css in haystack:
                found.append(css)
        return found

    @staticmethod
    def extract_sidebar_badges(soup: BeautifulSoup, label: str) -> List[str]:
        """
        Parse badge-links from the Vercel template detail page sidebar.

        The sidebar has sections like "Use Cases", "Stack", "Database" with
        short link-badges underneath. We find the label as a visible text node,
        then collect immediately following <a> siblings whose text is short
        (badges, not paragraph text).
        """
        badges: List[str] = []

        for span in soup.find_all(["span"]):
            text = span.get_text(strip=True)
            if text.lower() != label.lower():
                continue

            container = span.parent
            if not container:
                continue

            stop_labels = {
                "stack", "database", "authentication", "css",
                "cms", "experimentation", "framework",
                "github repo", "related templates", "use cases",
            }
            stop_labels.discard(label.lower())

            label_classes = set(span.get("class") or [])

            for sibling in container.find_all_next(limit=40):
                if sibling.name == "span" and sibling is not span:
                    sib_classes = set(sibling.get("class") or [])
                    if sib_classes & label_classes:
                        exact = sibling.get_text(strip=True).lower()
                        if exact in stop_labels:
                            break
                if sibling.name == "a":
                    link_text = sibling.get_text(strip=True)
                    if not link_text or len(link_text) > 40:
                        continue
                    href = (sibling.get("href") or "").lower()
                    if "/templates/" in href:
                        badges.append(link_text)
            if badges:
                break

        return badges

    @staticmethod
    def detect_monorepo_example(repo_url: Optional[str]) -> bool:
        if not repo_url:
            return False
        for known in MONOREPO_EXAMPLE_REPOS:
            if known.lower() in repo_url.lower():
                return True
        return False

    @staticmethod
    def detect_tutorial_template(page_text: str, repo_url: Optional[str]) -> bool:
        lower = page_text[:10000].lower()
        if "create-next-app --example" in lower or "create next app --example" in lower:
            return True
        if repo_url and any(m in repo_url.lower() for m in MONOREPO_EXAMPLE_REPOS):
            if "execute" in lower and "--example" in lower:
                return True
        return False

    @staticmethod
    def is_next_or_react(title: str, description: str, page_text: str, stack_tags: List[str]) -> Tuple[bool, str]:
        """
        Strikt gate: vi tar bara in mallar som tydligt är Next.js och/eller React-appar
        som passar motorns lane (inte SvelteKit, Vue, ren Docusaurus, m.m.).

        "React" i sidfot/relaterade mallar räcker inte — kräver Next.js-spår eller
        tydlig React-starter utan konkurrerande primär stack.
        """
        narrow = " ".join(
            [title or "", description or "", " ".join(stack_tags), page_text[:6000]]
        ).lower()
        full_hay = " ".join(
            [title or "", description or "", page_text[:12000], " ".join(stack_tags)]
        ).lower()

        # Primär stack vi inte har hantering för (ord/gränser, längre först)
        non_next_patterns: List[Tuple[str, str]] = [
            (r"\bsveltekit\b", "SvelteKit"),
            (r"\bsvelte\b", "Svelte"),
            (r"\bvue\.?js\b", "Vue.js"),
            (r"\bvue\b", "Vue"),
            (r"\bnuxt\b", "Nuxt"),
            (r"\bangular\b", "Angular"),
            (r"\bsolid(?:js)?\b", "Solid"),
            (r"\bastro\b", "Astro"),
            (r"\bgatsby\b", "Gatsby"),
            (r"\bdocusaurus\b", "Docusaurus"),
            (r"\bvitepress\b", "VitePress"),
            (r"\beleventy\b", "Eleventy"),
            (r"\bhugo\b", "Hugo"),
            (r"\bjekyll\b", "Jekyll"),
            (r"\bmkdocs\b", "MkDocs"),
        ]

        has_next = (
            "next.js" in narrow
            or "nextjs" in narrow
            or re.search(r"\bnext\.js\b", full_hay)
        )

        for pat, label in non_next_patterns:
            if re.search(pat, narrow) and not has_next:
                return False, f"Primär stack: {label} (inte Next.js-lane)"

        hits: List[str] = []
        if has_next or "next.js" in full_hay or "nextjs" in full_hay:
            hits.append("Next.js")
        if re.search(r"\breact\b", narrow):
            hits.append("React")
        if "create react app" in narrow:
            hits.append("Create React App")
        if "react router" in narrow:
            hits.append("React Router")

        if has_next:
            return True, ", ".join(sorted(set(hits))) if hits else "Next.js"

        # Utan Next.js: tillåt bara om React tydligt i titel/beskrivning/stack (smal yta)
        if re.search(r"\breact\b", narrow) and hits:
            return True, ", ".join(sorted(set(hits)))

        return False, "Ingen tydlig Next.js/React för denna lane (strikt läge)"

    @staticmethod
    def is_next_or_react_loose(title: str, description: str, page_text: str, stack_tags: List[str]) -> Tuple[bool, str]:
        """Tidigare heuristik (bredare träffar); används bara med --loose-framework-match."""
        haystack = " ".join(
            [title or "", description or "", page_text[:12000], " ".join(stack_tags)]
        ).lower()

        hits: List[str] = []

        if "next.js" in haystack or "nextjs" in haystack:
            hits.append("Next.js")
        if re.search(r"\breact\b", haystack):
            hits.append("React")
        if "create react app" in haystack:
            hits.append("Create React App")
        if "react router" in haystack:
            hits.append("React Router")

        if hits:
            return True, ", ".join(sorted(set(hits)))

        return False, "Ingen tydlig Next.js/React-träff"

    @staticmethod
    def extract_important_lines(page_text: str, max_lines: int = 80) -> List[str]:
        lines = [line.strip() for line in page_text.splitlines() if line.strip()]
        picked: List[str] = []
        seen = set()

        for line in lines:
            lower = line.lower()

            is_keyword_hit = any(keyword in lower for keyword in IMPORTANT_KEYWORDS)
            is_command = line.startswith(COMMAND_PREFIXES)
            is_env = bool(re.match(r"^[A-Z0-9_]{6,}$", line))
            is_codeish = lower.startswith(("http://", "https://", "localhost:", ".env", "app/", "src/"))

            if is_keyword_hit or is_command or is_env or is_codeish:
                norm = line.lower()
                if norm not in seen:
                    seen.add(norm)
                    picked.append(line)

            if len(picked) >= max_lines:
                break

        return picked

    def download_repo(self, repo_url: str, target_dir: Path) -> Tuple[bool, Optional[str]]:
        """
        Klonar repo om git finns. Returnerar (lyckades, felorsak vid misslyckande).
        """
        if shutil.which("git") is None:
            print("[WARN] git finns inte i PATH. Hoppar över repo-download.")
            return False, "git_saknas_i_path"

        clone_url = normalize_github_clone_url(repo_url)
        if not clone_url:
            print(f"[WARN] Ogiltig GitHub-repo-URL (efter normalisering): {repo_url!r}")
            return False, "ogiltig_github_url"

        if target_dir.exists() and any(target_dir.iterdir()):
            print(f"[INFO] Repo-mapp finns redan, hoppar över: {target_dir}")
            return True, None

        ensure_dir(target_dir.parent)

        try:
            subprocess.run(
                ["git", "clone", "--depth", "1", clone_url, str(target_dir)],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            return True, None
        except subprocess.CalledProcessError as exc:
            err = (exc.stderr or "").strip() or "clone_failed"
            print(f"[WARN] Kunde inte klona {clone_url}: {err}")
            return False, err


def write_info_file(template: TemplateInfo, folder: Path) -> None:
    info_path = folder / "INFO_SV.md"

    lines = [
        f"# {template.title}",
        "",
        "> **Inforuta**",
        ">",
        f"> **Kategori:** {template.category_name}",
        ">",
        f"> **Template-sida:** {template.template_url}",
        ">",
        f"> **Repo:** {template.repo_url or 'Hittades inte'}",
        ">",
        f"> **Demo:** {template.demo_url or 'Hittades inte'}",
        ">",
        f"> **Framework-match:** {'Ja' if template.framework_match else 'Nej'}",
        ">",
        f"> **Varför:** {template.framework_reason}",
        ">",
        f"> **Monorepo-example:** {'Ja' if template.is_monorepo_example else 'Nej'}",
        ">",
        f"> **Tutorial-template:** {'Ja' if template.is_tutorial_template else 'Nej'}",
        ">",
        f"> **Artefakt-nivå (mapp):** {template.artifact_tier or '(okänd)'}",
        "",
        "## Kort beskrivning",
        "",
        template.description or "Ingen beskrivning hittades.",
        "",
        "## Viktiga stack-/teknik-taggar",
        "",
    ]

    if template.stack_tags:
        for tag in template.stack_tags:
            lines.append(f"- {tag}")
    else:
        lines.append("- Inga tydliga stack-taggar hittades.")

    lines += [
        "",
        "## CSS-tekniker",
        "",
    ]
    if template.css_tags:
        for css in template.css_tags:
            lines.append(f"- {css}")
    else:
        lines.append("- Inga kända CSS-tekniker identifierade.")

    lines += ["", "## Use case-badges", ""]
    if template.use_case_badges:
        for badge in template.use_case_badges:
            lines.append(f"- {badge}")
    else:
        lines.append("- Inga use-case-badges hittades.")

    lines += ["", "## Database", ""]
    if template.database_badges:
        for badge in template.database_badges:
            lines.append(f"- {badge}")
    else:
        lines.append("- Ingen databas angiven.")

    lines += ["", "## Authentication", ""]
    if template.auth_badges:
        for badge in template.auth_badges:
            lines.append(f"- {badge}")
    else:
        lines.append("- Ingen auth angiven.")

    lines += [
        "",
        "## Instruktioner",
        "",
        "1. Läs först igenom den här filen.",
        "2. Öppna sedan `metadata.json` för rådata.",
        "3. Om repo har laddats ner: gå in i undermappen `repo`.",
        "4. Leta efter `.env.example`, `README.md`, `package.json` och eventuella `app/` eller `src/`-mappar.",
        "5. Kör vanligtvis `npm install` och sedan `npm run dev` om projektet använder npm.",
        "6. Om miljövariabler behövs: skapa `.env.local` eller motsvarande enligt repo/README.",
        "",
        "## Nödvändig info från template-sidan",
        "",
    ]

    if template.important_lines:
        for line in template.important_lines:
            lines.append(f"- {line}")
    else:
        lines.append("- Ingen extra viktig info kunde extraheras.")

    info_path.write_text("\n".join(lines), encoding="utf-8")


def write_metadata_file(template: TemplateInfo, folder: Path) -> None:
    metadata_path = folder / "metadata.json"
    metadata_path.write_text(
        json.dumps(asdict(template), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _relative_info_path(
    template: TemplateInfo,
    flat_layout: bool,
    *,
    direct_slug: Optional[str] = None,
) -> str:
    p = template_output_dir(Path("."), template, flat_layout, direct_slug=direct_slug)
    rel = (p / "INFO_SV.md").as_posix()
    if rel.startswith("./"):
        return rel
    return f"./{rel}"


def write_index_file(
    root: Path,
    collected: Dict[str, List[TemplateInfo]],
    index_sections: List[Tuple[str, str]],
    flat_layout: bool,
    *,
    direct_slug_by_url: Optional[Dict[str, str]] = None,
) -> None:
    path = root / "INDEX_SV.md"
    lines = [
        "# Vercel templates – Next.js / React (filtrerat)",
        "",
        f"Framework-filter: {', '.join(FRAMEWORK_FILTER)}",
        "",
        "Bara mallar som passerar strikt Next.js/React-lane och Vercels framework-filter tas med.",
        "",
        "Mappstruktur (standard): `full-repo/`, `tutorial-bootstrap/`, `monorepo-examples/` "
        "→ use-case-slug → mallmapp. Se `SCRAPE_LAYOUT_SV.md`.",
        "",
    ]

    total = 0
    slug_map = direct_slug_by_url or {}
    for category_slug, category_name in index_sections:
        templates = collected.get(category_slug, [])
        total += len(templates)

        lines += [
            f"## {category_name}",
            "",
            f"Antal: {len(templates)}",
            "",
        ]

        if not templates:
            lines.append("- Inga Next.js/React-mallar hittades.")
            lines.append("")
            continue

        for template in templates:
            ds = slug_map.get(template.template_url)
            rel_path = _relative_info_path(template, flat_layout, direct_slug=ds)
            lines.append(f"- **{template.title}** (`{template.artifact_tier}`)")
            lines.append(f"  - Info: `{rel_path}`")
            lines.append(f"  - Repo: {template.repo_url or 'Hittades inte'}")
            lines.append(f"  - Demo: {template.demo_url or 'Hittades inte'}")
            lines.append("")

    lines.insert(4, f"Totalt antal sparade templates: **{total}**")
    path.write_text("\n".join(lines), encoding="utf-8")


def write_scrape_layout_readme(root: Path, extended: bool, flat_layout: bool) -> None:
    """Kort översikt vid scrape-root (påverkar inte Sajtmaskin-runtime)."""
    core_n = len(USE_CASES_CORE)
    ext_n = len(USE_CASES_EXTENDED)
    lines = [
        "# Vercel-scrape — mappstruktur",
        "",
        "## Use cases som körs",
        f"- **Standard:** {core_n} kärnkategorier (marketing, starter, saas, ecommerce, …).",
        f"- **Med `--extended-scrape`:** +{ext_n} (documentation, monorepos).",
        "",
        "## Undermappar per malltyp",
        f"- **`{ARTIFACT_TIER_FULL_REPO}/`** — fristående repo; kloning sker om `--skip-download` inte är satt.",
        f"- **`{ARTIFACT_TIER_TUTORIAL}/`** — innehåller ofta `create-next-app --example` / bootstrap; metadata viktigare än klon.",
        f"- **`{ARTIFACT_TIER_MONOREPO}/`** — kända monorepo-exempel (t.ex. vercel/next.js); kloning hoppas över som standard.",
        "",
        "## Layout",
        "- **Tierad (standard):** `<tier>/<use-case-slug>/<mallmapp>/` (direkt-URL: `…/direct-urls/<slug>/`).",
        "- **Platt (`--flat-layout`):** `<use-case-slug>/<mallmapp>/` som tidigare.",
        "",
        f"Aktuell körning: extended={'ja' if extended else 'nej'}, flat_layout={'ja' if flat_layout else 'nej'}.",
        "",
    ]
    (root / "SCRAPE_LAYOUT_SV.md").write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ladda hem upp till N Next.js/React-templates från Vercel (use cases eller angivna URLs)."
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Utmapp (default: syskonmapp bredvid repot, t.ex. ../vercel-scrape).",
    )
    parser.add_argument(
        "--per-category",
        type=int,
        default=6,
        help="Max antal templates per kategori (endast use-case-läge).",
    )
    parser.add_argument(
        "--urls",
        nargs="*",
        default=None,
        help=(
            "Fullständiga mallsidor, t.ex. https://vercel.com/templates/ecommerce/nextjs-commerce "
            "(kör endast dessa; sparas under …/direct-urls/<mall-slug>/ i tierat läge). "
            "Täcker även /templates/next.js/... som inte ingår i kärnlistan."
        ),
    )
    parser.add_argument(
        "--canonical-urls",
        action="store_true",
        help=(
            "Inkludera de tre kanoniska mall-URL:erna (se CANONICAL_TEMPLATE_URLS i skriptet). "
            "Om inga --urls anges kör skriptet bara dessa tre."
        ),
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skippa git clone och skapa bara infofiler + metadata.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.4,
        help="Paus mellan requests.",
    )
    parser.add_argument(
        "--interactive",
        "-i",
        action="store_true",
        help="Interaktiv meny (rekommenderat vid manuell körning från repo-root).",
    )
    parser.add_argument(
        "--loose-framework-match",
        action="store_true",
        help=(
            "Använd äldre, bredare Next/React-heuristik (kan ta med Svelte/Docusaurus m.m.). "
            "Standard är strikt lane-matchning."
        ),
    )
    parser.add_argument(
        "--extended-scrape",
        action="store_true",
        help=(
            "Lägg till documentation + monorepos (mer brus; bra för research, sämre som kärndata)."
        ),
    )
    parser.add_argument(
        "--flat-layout",
        action="store_true",
        help=(
            "Spara utan artefakt-tier: <kategori>/<mall>/ (gammalt läge). Standard är "
            f"{ARTIFACT_TIER_FULL_REPO}|{ARTIFACT_TIER_TUTORIAL}|{ARTIFACT_TIER_MONOREPO}/<kategori>/…"
        ),
    )
    return parser.parse_args()


def default_output_root() -> Path:
    env = os.environ.get("SAJTMASKIN_VERCEL_SCRAPE_DIR", "").strip()
    if env:
        return Path(env).expanduser()
    # Syskonmapp till git-repots rot (skript i repo-rot eller under t.ex. scripts/).
    here = Path(__file__).resolve().parent
    repo_root = here if (here / ".git").exists() else here.parent
    return repo_root.parent / "vercel-scrape"


def apply_arg_defaults(args: argparse.Namespace) -> None:
    if args.output is None:
        args.output = str(default_output_root())


def merge_canonical_urls(args: argparse.Namespace) -> None:
    if not args.canonical_urls:
        return
    merged: List[str] = list(CANONICAL_TEMPLATE_URLS)
    if args.urls:
        for u in args.urls:
            u = (u or "").strip()
            if u and u not in merged:
                merged.append(u)
    args.urls = merged


def _prompt_yes_no(prompt: str, default_yes: bool = False) -> bool:
    hint = " [Y/n]: " if default_yes else " [y/N]: "
    r = input(prompt + hint).strip().lower()
    if not r:
        return default_yes
    return r in ("y", "yes", "j", "ja")


def interactive_args() -> argparse.Namespace:
    home_default = str(default_output_root())
    print("\n=== Vercel Templates — interaktiv körning ===\n")
    out = input(f"Output-mapp (Zone 1, helst utanför repo) [{home_default}]: ").strip() or home_default
    skip = _prompt_yes_no(
        "Endast metadata (summary.json + ingestion_report.json), utan git clone?",
        default_yes=True,
    )
    delay_s = input("Paus mellan HTTP-anrop i sekunder [0.4]: ").strip() or "0.4"
    try:
        delay = float(delay_s)
    except ValueError:
        delay = 0.4

    n_core = len(USE_CASES_CORE)
    n_ext = len(USE_CASES_EXTENDED)
    print(
        "\nVälj läge:\n"
        f"  1) Kärn-use-cases ({n_core} kategorier; + documentation/monorepos med flaggan --extended-scrape)\n"
        "  2) Bara de tre kanoniska mall-URL:erna (snabb kontroll)\n"
        "  3) Egna URL:er (en per rad)\n"
        f"     (Utökad inventering: +{n_ext} kategorier via CLI: --extended-scrape)\n"
    )
    choice = input("Val [1]: ").strip() or "1"

    urls: Optional[List[str]] = None
    per_cat = 6
    canonical = False

    if choice == "2":
        urls = list(CANONICAL_TEMPLATE_URLS)
    elif choice == "3":
        print("Klistra in fullständiga https://vercel.com/templates/... URL:er (tom rad avslutar):")
        lines: List[str] = []
        while True:
            try:
                line = input().strip()
            except EOFError:
                break
            if not line:
                break
            lines.append(line)
        urls = lines if lines else list(CANONICAL_TEMPLATE_URLS)
    else:
        pc = input("Max mallar per kategori (use-case-läge) [6]: ").strip() or "6"
        try:
            per_cat = max(1, int(pc))
        except ValueError:
            per_cat = 6

    return argparse.Namespace(
        output=out,
        per_category=per_cat,
        urls=urls,
        skip_download=skip,
        delay=delay,
        interactive=False,
        canonical_urls=canonical,
        loose_framework_match=False,
        extended_scrape=False,
        flat_layout=False,
    )


def write_ingestion_report(root: Path, mode: str, entries: List[Dict]) -> None:
    """Maskinläsbar sammanställning för inventering / LLM (utan att öppna varje mapp)."""
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "entry_count": len(entries),
        "entries": entries,
    }
    (root / "ingestion_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _persist_template(
    scraper: VercelTemplateScraper,
    root: Path,
    template: TemplateInfo,
    template_dir: Path,
    args: argparse.Namespace,
    report_entries: List[Dict],
) -> None:
    ensure_dir(template_dir)
    write_info_file(template, template_dir)
    write_metadata_file(template, template_dir)

    clone_attempted = False
    clone_ok: Optional[bool] = None
    clone_error: Optional[str] = None
    disk_bytes_repo = 0
    repo_dir = template_dir / "repo"

    if not args.skip_download and template.repo_url:
        if template.is_monorepo_example:
            print(f"[SKIP] Hoppar över kloning av monorepo-example: {template.repo_url}")
            clone_error = "monorepo_example_skipped"
        else:
            clone_attempted = True
            ok, clone_error = scraper.download_repo(template.repo_url, repo_dir)
            clone_ok = ok
            if ok and repo_dir.is_dir():
                disk_bytes_repo = dir_size_bytes(repo_dir)
    elif not template.repo_url:
        clone_ok = None

    report_entries.append(
        {
            "template_url": template.template_url,
            "title": template.title,
            "category_slug": template.category_slug,
            "artifact_tier": template.artifact_tier,
            "repo_url": template.repo_url,
            "framework_match": template.framework_match,
            "framework_reason": template.framework_reason,
            "relative_folder": str(template_dir.relative_to(root)).replace("\\", "/"),
            "clone_attempted": clone_attempted,
            "clone_ok": clone_ok,
            "clone_error": clone_error,
            "disk_bytes_repo": disk_bytes_repo,
        }
    )


def main() -> int:
    args = parse_args()
    if args.interactive:
        args = interactive_args()
    apply_arg_defaults(args)
    merge_canonical_urls(args)
    return run_scrape(args)


def run_scrape(args: argparse.Namespace) -> int:
    root = Path(args.output).expanduser().resolve()
    ensure_dir(root)

    scraper = VercelTemplateScraper(
        delay=args.delay,
        loose_framework_match=getattr(args, "loose_framework_match", False),
    )
    collected: Dict[str, List[TemplateInfo]] = {}
    report_entries: List[Dict] = []
    extended = getattr(args, "extended_scrape", False)
    flat_layout = getattr(args, "flat_layout", False)
    use_cases = active_use_cases(extended)
    direct_slug_by_url: Dict[str, str] = {}

    print(f"[INFO] Sparar till: {root}")
    print(
        f"[INFO] Use cases: {len(use_cases)} st "
        f"({'kärna+utökad' if extended else 'endast kärna'}), "
        f"layout: {'platt' if flat_layout else 'tierad'}"
    )

    if args.urls:
        mode = "direct_urls"
        print("[INFO] Läge: angivna mallsidor (--urls)")
        print()
        collected["direct-urls"] = []
        for raw in args.urls:
            url = raw.strip()
            m = _VERCEL_TEMPLATE_PATH_RE.match(url)
            if not m:
                print(f"[WARN] Hoppar över (förväntar …/templates/<segment>/<mall>): {url}")
                report_entries.append(
                    {
                        "template_url": url,
                        "error": "bad_url_pattern",
                        "clone_attempted": False,
                    }
                )
                continue
            cat_slug, tmpl_slug = m.group(1), m.group(2)
            display = f"{cat_slug}/{tmpl_slug}"
            print(f"[INFO] Läser: {url}")
            template = scraper.parse_detail_page(cat_slug, display, url)
            if not template:
                report_entries.append(
                    {
                        "template_url": url,
                        "error": "fetch_or_parse_failed",
                        "clone_attempted": False,
                    }
                )
                continue

            if not template.framework_match:
                print(f"  [SKIP] Inte Next.js/React -> {template.title}")
                report_entries.append(
                    {
                        "template_url": url,
                        "title": template.title,
                        "repo_url": template.repo_url,
                        "framework_match": False,
                        "framework_reason": template.framework_reason,
                        "skip_reason": "framework_mismatch",
                        "clone_attempted": False,
                    }
                )
                continue

            assign_artifact_tier(template)
            direct_slug_by_url[url] = tmpl_slug
            print(f"  [OK] {template.title} ({template.framework_reason}) [{template.artifact_tier}]")
            collected["direct-urls"].append(template)
            template_dir = template_output_dir(root, template, flat_layout, direct_slug=tmpl_slug)
            _persist_template(scraper, root, template, template_dir, args, report_entries)
            print()

        index_sections: List[Tuple[str, str]] = [("direct-urls", "Direkt-URL:er")]

    else:
        mode = "use_cases"
        print("[INFO] Hämtar use case-kategorier...")
        print()

        for category_slug, category_name in use_cases:
            collected[category_slug] = []

        for category_slug, category_name in use_cases:
            print(f"[INFO] Kategori: {category_name} ({category_slug})")
            category_urls = scraper.get_category_template_urls(category_slug)

            if not category_urls:
                print("  [WARN] Inga template-URL:er hittades.")
                print()
                continue

            matched_templates: List[TemplateInfo] = []

            for template_url in category_urls:
                if len(matched_templates) >= args.per_category:
                    break

                print(f"  [INFO] Läser: {template_url}")
                template = scraper.parse_detail_page(category_slug, category_name, template_url)
                if not template:
                    report_entries.append(
                        {
                            "template_url": template_url,
                            "category_slug": category_slug,
                            "error": "fetch_or_parse_failed",
                            "clone_attempted": False,
                        }
                    )
                    continue

                if not template.framework_match:
                    print(f"  [SKIP] Inte Next.js/React -> {template.title}")
                    report_entries.append(
                        {
                            "template_url": template_url,
                            "title": template.title,
                            "repo_url": template.repo_url,
                            "category_slug": category_slug,
                            "framework_match": False,
                            "skip_reason": "framework_mismatch",
                            "clone_attempted": False,
                        }
                    )
                    continue

                assign_artifact_tier(template)
                matched_templates.append(template)
                print(f"  [OK] {template.title} ({template.framework_reason}) [{template.artifact_tier}]")

            collected[category_slug] = matched_templates

            for template in matched_templates:
                template_dir = template_output_dir(root, template, flat_layout)
                _persist_template(scraper, root, template, template_dir, args, report_entries)

            print()

        index_sections = list(use_cases)

    summary = {
        slug: [asdict(t) for t in templates]
        for slug, templates in collected.items()
    }
    (root / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    write_index_file(
        root,
        collected,
        index_sections,
        flat_layout,
        direct_slug_by_url=direct_slug_by_url if args.urls else None,
    )
    write_scrape_layout_readme(root, extended, flat_layout)
    write_ingestion_report(root, mode, report_entries)

    print("[KLAR]")
    print(f"[INFO] INDEX: {root / 'INDEX_SV.md'}")
    print(f"[INFO] LAYOUT: {root / 'SCRAPE_LAYOUT_SV.md'}")
    print(f"[INFO] SUMMARY: {root / 'summary.json'}")
    print(f"[INFO] INVENTERING (LLM): {root / 'ingestion_report.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
