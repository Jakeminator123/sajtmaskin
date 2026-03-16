import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional, Dict, Tuple
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://vercel.com"
TEMPLATES_URL = f"{BASE_URL}/templates"

USE_CASES: List[Tuple[str, str]] = [
    ("ai", "AI"),
    ("starter", "Starter"),
    ("ecommerce", "Ecommerce"),
    ("saas", "SaaS"),
    ("blog", "Blog"),
    ("portfolio", "Portfolio"),
    ("cms", "CMS"),
    ("backend", "Backend"),
    ("edge-functions", "Edge Functions"),
    ("edge-middleware", "Edge Middleware"),
    ("edge-config", "Edge Config"),
    ("cron", "Cron"),
    ("multi-tenant-apps", "Multi-Tenant Apps"),
    ("realtime-apps", "Realtime Apps"),
    ("documentation", "Documentation"),
    ("virtual-event", "Virtual Event"),
    ("monorepos", "Monorepos"),
    ("web3", "Web3"),
    ("vercel-firewall", "Vercel Firewall"),
    ("microfrontends", "Microfrontends"),
    ("authentication", "Authentication"),
    ("marketing-sites", "Marketing Sites"),
    ("cdn", "CDN"),
    ("admin-dashboard", "Admin Dashboard"),
    ("security", "Security"),
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
    important_lines: List[str]


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
    def __init__(self, timeout: int = 30, delay: float = 0.4):
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.timeout = timeout
        self.delay = delay

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
        Hämtar alla template-URL:er från en use-case-sida.
        """
        url = f"{TEMPLATES_URL}/{category_slug}"
        soup = self.get_soup(url)
        if not soup:
            return []

        href_pattern = re.compile(rf"^/templates/{re.escape(category_slug)}/[^/]+/?$")
        urls: List[str] = []
        seen = set()

        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if href_pattern.match(href):
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
        framework_match, framework_reason = self.is_next_or_react(title, description, page_text, stack_tags)
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
        # Försök först hitta ankare med text GitHub Repo
        for a in soup.find_all("a", href=True):
            text = a.get_text(" ", strip=True).lower()
            href = a["href"].strip()
            if "github repo" in text and "github.com" in href:
                return href

        # Annars första repo-liknande github-länk
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if "github.com" in href and re.search(r"github\.com/[^/]+/[^/#?]+", href):
                return href

        return None

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
    def is_next_or_react(title: str, description: str, page_text: str, stack_tags: List[str]) -> Tuple[bool, str]:
        haystack = " ".join(
            [title or "", description or "", page_text[:12000], " ".join(stack_tags)]
        ).lower()

        hits = []

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

    def download_repo(self, repo_url: str, target_dir: Path) -> bool:
        """
        Klonar repo om git finns.
        """
        if shutil.which("git") is None:
            print("[WARN] git finns inte i PATH. Hoppar över repo-download.")
            return False

        if target_dir.exists() and any(target_dir.iterdir()):
            print(f"[INFO] Repo-mapp finns redan, hoppar över: {target_dir}")
            return True

        ensure_dir(target_dir.parent)

        try:
            subprocess.run(
                ["git", "clone", "--depth", "1", repo_url, str(target_dir)],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            return True
        except subprocess.CalledProcessError as exc:
            print(f"[WARN] Kunde inte klona {repo_url}: {exc.stderr.strip()}")
            return False


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


def write_index_file(root: Path, collected: Dict[str, List[TemplateInfo]]) -> None:
    path = root / "INDEX_SV.md"
    lines = [
        "# Vercel templates – Next.js / React",
        "",
        "Detta index innehåller upp till 6 mallar per Use Case-kategori.",
        "Bara mallar som matchar Next.js eller React har tagits med.",
        "",
    ]

    total = 0
    for _, category_name in USE_CASES:
        category_slug = slugify(category_name).replace("edge-functions", "edge-functions")
        # vi mappar via actual slug-listan nedan istället
        pass

    for category_slug, category_name in USE_CASES:
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
            folder_name = safe_folder_name(template.title)
            rel_path = f"./{category_slug}/{folder_name}/INFO_SV.md"
            lines.append(f"- **{template.title}**")
            lines.append(f"  - Info: `{rel_path}`")
            lines.append(f"  - Repo: {template.repo_url or 'Hittades inte'}")
            lines.append(f"  - Demo: {template.demo_url or 'Hittades inte'}")
            lines.append("")

    lines.insert(4, f"Totalt antal sparade templates: **{total}**")
    path.write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ladda hem upp till 6 Next.js/React-templates från alla Vercel Use Case-kategorier."
    )
    parser.add_argument(
        "--output",
        default="vercel_usecase_next_react_templates",
        help="Utmapp där allt sparas.",
    )
    parser.add_argument(
        "--per-category",
        type=int,
        default=6,
        help="Max antal templates per kategori.",
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
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.output).resolve()
    ensure_dir(root)

    scraper = VercelTemplateScraper(delay=args.delay)
    collected: Dict[str, List[TemplateInfo]] = {}

    print(f"[INFO] Sparar till: {root}")
    print("[INFO] Hämtar alla Use Case-kategorier...")
    print()

    for category_slug, category_name in USE_CASES:
        print(f"[INFO] Kategori: {category_name} ({category_slug})")
        category_urls = scraper.get_category_template_urls(category_slug)

        if not category_urls:
            print("  [WARN] Inga template-URL:er hittades.")
            collected[category_slug] = []
            print()
            continue

        matched_templates: List[TemplateInfo] = []

        for template_url in category_urls:
            if len(matched_templates) >= args.per_category:
                break

            print(f"  [INFO] Läser: {template_url}")
            template = scraper.parse_detail_page(category_slug, category_name, template_url)
            if not template:
                continue

            if not template.framework_match:
                print(f"  [SKIP] Inte Next.js/React -> {template.title}")
                continue

            matched_templates.append(template)
            print(f"  [OK] {template.title} ({template.framework_reason})")

        collected[category_slug] = matched_templates

        category_dir = root / category_slug
        ensure_dir(category_dir)

        for template in matched_templates:
            folder_name = safe_folder_name(template.title)
            template_dir = category_dir / folder_name
            ensure_dir(template_dir)

            write_info_file(template, template_dir)
            write_metadata_file(template, template_dir)

            if not args.skip_download and template.repo_url:
                repo_dir = template_dir / "repo"
                scraper.download_repo(template.repo_url, repo_dir)

        print()

    summary = {
        slug: [asdict(t) for t in templates]
        for slug, templates in collected.items()
    }
    (root / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    write_index_file(root, collected)

    print("[KLAR]")
    print(f"[INFO] INDEX: {root / 'INDEX_SV.md'}")
    print(f"[INFO] SUMMARY: {root / 'summary.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())