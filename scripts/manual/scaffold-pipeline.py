#!/usr/bin/env python3
"""
Scaffold Pipeline — interaktivt menyskript för att hantera hela
template-library-kedjan.

Kör från repo-rot:
  python scripts/manual/scaffold-pipeline.py
"""
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PIPELINE_ROOT = REPO_ROOT / "data" / "external-template-pipeline"
SCRAPE_CACHE_ROOT = PIPELINE_ROOT / "scrape-cache" / "current"
RAW_DISCOVERY_CURRENT = PIPELINE_ROOT / "raw-discovery" / "current"
GENERATED_JSON = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
EMBEDDINGS_JSON = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library-embeddings.json"
SCAFFOLD_EMBEDDINGS = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-embeddings.json"
DOSSIER_ROOT = PIPELINE_ROOT / "reference-library" / "dossiers"

BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


def run(cmd: str, check: bool = True) -> int:
    print(f"\n{BLUE}> {cmd}{RESET}\n")
    result = subprocess.run(cmd, shell=True, cwd=str(REPO_ROOT))
    if check and result.returncode != 0:
        print(f"{RED}Kommandot misslyckades (exit {result.returncode}){RESET}")
    return result.returncode


def count_json_entries(path: Path, key: str = "curatedTemplates") -> str:
    if not path.exists():
        return "saknas"
    import json
    try:
        data = json.loads(path.read_text("utf-8"))
        if key in data:
            return str(data[key])
        if "embeddings" in data:
            return str(len(data["embeddings"]))
        if "_meta" in data and "count" in data["_meta"]:
            return str(data["_meta"]["count"])
        return "okänt format"
    except Exception:
        return "kunde inte läsa"


def count_dossiers() -> int:
    if not DOSSIER_ROOT.exists():
        return 0
    return sum(1 for d in DOSSIER_ROOT.iterdir() if d.is_dir())


def show_status():
    print(f"\n{BOLD}=== Status ==={RESET}")
    has_discovery = (RAW_DISCOVERY_CURRENT / "summary.json").exists()
    has_scrape_cache = (SCRAPE_CACHE_ROOT / "summary.json").exists()
    print(f"  Canonical scrape cache (data/external-template-pipeline): {'finns' if has_scrape_cache else 'SAKNAS'}")
    print(f"  Raw discovery (current/summary.json): {'finns' if has_discovery else 'SAKNAS'}")
    print(f"  Dossiers:                             {count_dossiers()} st")
    print(f"  template-library.generated.json:      {count_json_entries(GENERATED_JSON)} kuraterade")
    print(f"  template-library-embeddings.json:     {count_json_entries(EMBEDDINGS_JSON)} embeddings")
    print(f"  scaffold-embeddings.json:             {count_json_entries(SCAFFOLD_EMBEDDINGS)} embeddings")
    print()


def menu():
    print(f"""
{BOLD}╔══════════════════════════════════════════════════════╗
║          Scaffold Pipeline — Sajtmaskin               ║
╚══════════════════════════════════════════════════════╝{RESET}

  {GREEN}1{RESET}  Skrapa nya templates till kanonisk data-mapp
     (Python intake — bred research till data/external-template-pipeline)

  {GREEN}2{RESET}  Importera scrape-cache till raw-discovery/current
     (Snabb, använder data/external-template-pipeline/scrape-cache/current)

  {GREEN}3{RESET}  Ladda ner repos (hydrate cache)
     (Shallow clones av alla repos, tar 5-15 min)

  {GREEN}4{RESET}  Bygg template-library + dossiers
     (Analyserar repos, skapar dossiers och generated JSON)

  {GREEN}5{RESET}  Generera template-library embeddings
     (OpenAI API-anrop, kostar ~$0.01)

  {GREEN}6{RESET}  Generera scaffold embeddings
     (OpenAI API-anrop för de 10 runtime scaffolds)

  {GREEN}7{RESET}  Kör ALLT från befintlig scrape-cache
     (Import + hydrate + build + embeddings via full_template_refresh.py)

  {GREEN}8{RESET}  Kör ALLT från scratch
     (Ny bred scrape + hela kedjan via full_template_refresh.py)

  {GREEN}9{RESET}  Visa status

  {GREEN}0{RESET}  Avsluta
""")


def confirm(msg: str) -> bool:
    answer = input(f"{YELLOW}{msg} (j/n): {RESET}").strip().lower()
    return answer in ("j", "ja", "y", "yes")


def step_discover():
    print(f"\n{BOLD}Steg: Skrapa templates till kanonisk data-mapp{RESET}")
    print(f"Output: {SCRAPE_CACHE_ROOT}")
    print("Detta kör den breda Python-intaken och sparar research i den kanoniska data-mappen.")
    if not confirm("Fortsätt?"):
        return
    run(
        "py scripts/template-library/hamta_sidor_branch_emil.py "
        f'--output "{SCRAPE_CACHE_ROOT}" --legacy-wide-use-cases --per-category 999 --delay 0.4 --skip-download'
    )


def step_import_legacy():
    print(f"\n{BOLD}Steg: Importera scrape-cache till raw-discovery/current{RESET}")
    print(f"Källa: {SCRAPE_CACHE_ROOT}")
    run(
        "npx tsx scripts/template-library/import-template-discovery.ts "
        f'--from="{SCRAPE_CACHE_ROOT}" --label=external-scrape-dataset'
    )


def step_hydrate():
    print(f"\n{BOLD}Steg: Ladda ner repos (shallow clones){RESET}")
    if not (RAW_DISCOVERY_CURRENT / "summary.json").exists():
        print(f"{RED}Ingen summary.json hittad i raw-discovery/current/.")
        print(f"Kör steg 1 eller 2 först.{RESET}")
        return
    run(
        "npx tsx scripts/template-library/hydrate-template-library-cache.ts "
        f'--source="{RAW_DISCOVERY_CURRENT}"'
    )


def step_build():
    print(f"\n{BOLD}Steg: Bygg template-library + dossiers{RESET}")
    run(
        "npx tsx scripts/template-library/build-template-library.ts "
        f'--source="{RAW_DISCOVERY_CURRENT}"'
    )


def step_template_embeddings():
    print(f"\n{BOLD}Steg: Generera template-library embeddings{RESET}")
    print("Anropar OpenAI embedding API (text-embedding-3-small)")
    if not confirm("Fortsätt? (kostar ~$0.01)"):
        return
    run("npm run template-library:embeddings")


def step_scaffold_embeddings():
    print(f"\n{BOLD}Steg: Generera scaffold embeddings{RESET}")
    print("Anropar OpenAI embedding API för de 10 runtime scaffolds")
    if not confirm("Fortsätt?"):
        return
    run("npm run scaffolds:embeddings")


def step_full_from_existing():
    print(f"\n{BOLD}Kör hela kedjan från befintlig scrape-cache{RESET}")
    if not (SCRAPE_CACHE_ROOT / "summary.json").exists():
        print(f"{RED}Ingen scrape-cache hittad i {SCRAPE_CACHE_ROOT}.{RESET}")
        print(f"Kör steg 1 först.{RESET}")
        return
    run(
        "py scripts/template-library/full_template_refresh.py "
        f'--skip-scrape --scrape-output "{SCRAPE_CACHE_ROOT}"'
    )
    print(f"\n{GREEN}{BOLD}Klart! Hela kedjan kördes.{RESET}")
    show_status()


def step_full_from_scratch():
    print(f"\n{BOLD}Kör ALLT från scratch{RESET}")
    print("1. Bred scrape till kanonisk data-mapp")
    print("2. Import till raw-discovery/current")
    print("3. Hydrate repo-cache")
    print("4. Bygg dossiers + generated JSON")
    print("5. Generera embeddings")
    if not confirm("Detta tar 15-25 minuter. Fortsätt?"):
        return

    run(
        "py scripts/template-library/full_template_refresh.py "
        f'--scrape-output "{SCRAPE_CACHE_ROOT}"'
    )
    print(f"\n{GREEN}{BOLD}Klart! Hela pipelinen kördes från scratch.{RESET}")
    show_status()


def main():
    os.chdir(str(REPO_ROOT))

    while True:
        show_status()
        menu()
        choice = input(f"{BOLD}Välj (0-9): {RESET}").strip()

        if choice == "1":
            step_discover()
        elif choice == "2":
            step_import_legacy()
        elif choice == "3":
            step_hydrate()
        elif choice == "4":
            step_build()
        elif choice == "5":
            step_template_embeddings()
        elif choice == "6":
            step_scaffold_embeddings()
        elif choice == "7":
            step_full_from_existing()
        elif choice == "8":
            step_full_from_scratch()
        elif choice == "9":
            show_status()
        elif choice == "0":
            print(f"\n{GREEN}Hej då!{RESET}")
            break
        else:
            print(f"{RED}Ogiltigt val. Försök igen.{RESET}")

        input(f"\n{YELLOW}Tryck Enter för att gå tillbaka till menyn...{RESET}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Avbrutet.{RESET}")
        sys.exit(0)
