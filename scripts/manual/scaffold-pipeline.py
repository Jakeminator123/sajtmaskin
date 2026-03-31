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
RAW_DISCOVERY_CURRENT = REPO_ROOT / "research" / "external-templates" / "raw-discovery" / "current"
GENERATED_JSON = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
EMBEDDINGS_JSON = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library-embeddings.json"
SCAFFOLD_EMBEDDINGS = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-embeddings.json"
DOSSIER_ROOT = REPO_ROOT / "research" / "external-templates" / "reference-library" / "dossiers"

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

  {GREEN}1{RESET}  Skrapa nya templates från vercel.com/templates
     (Playwright — hittar ~150-200 templates, tar 5-10 min)

  {GREEN}2{RESET}  Importera legacy-dataset från Desktop/_sidor
     (Snabb, använder befintlig summary.json)

  {GREEN}3{RESET}  Ladda ner repos (hydrate cache)
     (Shallow clones av alla repos, tar 5-15 min)

  {GREEN}4{RESET}  Bygg template-library + dossiers
     (Analyserar repos, skapar dossiers och generated JSON)

  {GREEN}5{RESET}  Generera template-library embeddings
     (OpenAI API-anrop, kostar ~$0.01)

  {GREEN}6{RESET}  Generera scaffold embeddings
     (OpenAI API-anrop för de 10 runtime scaffolds)

  {GREEN}7{RESET}  Kör ALLT: import + hydrate + build + embeddings
     (Hela kedjan från befintlig discovery)

  {GREEN}8{RESET}  Kör ALLT från scratch: skrapa + hydrate + build + embeddings
     (Ny Playwright-skrapning + hela kedjan)

  {GREEN}9{RESET}  Visa status

  {GREEN}0{RESET}  Avsluta
""")


def confirm(msg: str) -> bool:
    answer = input(f"{YELLOW}{msg} (j/n): {RESET}").strip().lower()
    return answer in ("j", "ja", "y", "yes")


def step_discover():
    print(f"\n{BOLD}Steg: Skrapa templates från vercel.com{RESET}")
    print("Detta kör Playwright och besöker vercel.com/templates.")
    print("Kräver: npx playwright install chromium (om inte redan gjort)")
    if not confirm("Fortsätt?"):
        return
    run("npm run references:discover")


def step_import_legacy():
    print(f"\n{BOLD}Steg: Importera legacy-dataset{RESET}")
    print("Importerar till raw-discovery/current/ från prioriterad extern källa.")
    print("Ordning: SAJTMASKIN_VERCEL_SCRAPE_DIR -> ../vercel-scrape-fresh -> ../vercel-scrape -> _sidor/")
    run("npm run template-library:import-legacy")


def step_hydrate():
    print(f"\n{BOLD}Steg: Ladda ner repos (shallow clones){RESET}")
    if not (RAW_DISCOVERY_CURRENT / "summary.json").exists():
        print(f"{RED}Ingen summary.json hittad i raw-discovery/current/.")
        print(f"Kör steg 1 eller 2 först.{RESET}")
        return
    run("npm run template-library:hydrate-cache")


def step_build():
    print(f"\n{BOLD}Steg: Bygg template-library + dossiers{RESET}")
    run("npm run template-library:build")


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
    print(f"\n{BOLD}Kör hela kedjan från befintlig discovery{RESET}")
    if not (RAW_DISCOVERY_CURRENT / "summary.json").exists():
        print("Ingen discovery-data hittad. Importerar legacy först...")
        step_import_legacy()

    step_hydrate()
    step_build()
    step_template_embeddings()
    step_scaffold_embeddings()
    print(f"\n{GREEN}{BOLD}Klart! Hela kedjan kördes.{RESET}")
    show_status()


def step_full_from_scratch():
    print(f"\n{BOLD}Kör ALLT från scratch{RESET}")
    print("1. Skrapa vercel.com/templates med Playwright")
    print("2. Ladda ner repos")
    print("3. Bygg dossiers + generated JSON")
    print("4. Generera embeddings")
    if not confirm("Detta tar 15-25 minuter. Fortsätt?"):
        return

    step_discover()
    step_hydrate()
    step_build()
    step_template_embeddings()
    step_scaffold_embeddings()
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
