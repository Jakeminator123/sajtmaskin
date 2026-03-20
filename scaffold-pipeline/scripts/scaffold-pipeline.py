#!/usr/bin/env python3
"""
Scaffold Pipeline -- interaktivt menyskript for hela kedjan fran
ratt template-discovery till runtime-redo scaffolds.

Kor fran reporoten:
    python scaffold-pipeline/scripts/scaffold-pipeline.py

De tre faserna:
    Fas 1 -- DISCOVERY:   Skrapa eller importera externa templates
    Fas 2 -- BUILD:       Klona repos, analysera, skapa dossiers + genererade artefakter
    Fas 3 -- VERIFY:      Generera embeddings OCH verifiera att svenska prompter
                          matchar ratt scaffold via nyckelord och/eller vektorer
"""
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PIPELINE_ROOT = REPO_ROOT / "scaffold-pipeline"
RAW_DISCOVERY_CURRENT = PIPELINE_ROOT / "discovery" / "current"
GENERATED_JSON = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
EMBEDDINGS_JSON = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library-embeddings.json"
SCAFFOLD_EMBEDDINGS = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-embeddings.json"
DOSSIER_ROOT = PIPELINE_ROOT / "dossiers"

BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

# ---------------------------------------------------------------------------
# Hjalpfunktioner
# ---------------------------------------------------------------------------

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
        return "okant format"
    except Exception:
        return "kunde inte lasa"


def count_dossiers() -> int:
    if not DOSSIER_ROOT.exists():
        return 0
    return sum(1 for d in DOSSIER_ROOT.iterdir() if d.is_dir())


def confirm(msg: str) -> bool:
    answer = input(f"{YELLOW}{msg} (j/n): {RESET}").strip().lower()
    return answer in ("j", "ja", "y", "yes")


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

def show_status():
    has_discovery = (RAW_DISCOVERY_CURRENT / "summary.json").exists()
    has_embeds = SCAFFOLD_EMBEDDINGS.exists()
    has_tl_embeds = EMBEDDINGS_JSON.exists()

    print(f"\n{BOLD}=== Pipeline-status ==={RESET}")
    print(f"  {CYAN}Fas 1{RESET}  Discovery (summary.json):    {'finns' if has_discovery else f'{RED}SAKNAS{RESET}'}")
    print(f"         Dossiers:                      {count_dossiers()} st")
    print(f"  {CYAN}Fas 2{RESET}  template-library.generated:  {count_json_entries(GENERATED_JSON)} kuraterade")
    print(f"         template-library-embeddings:    {'finns' if has_tl_embeds else f'{RED}SAKNAS{RESET}'}")
    print(f"  {CYAN}Fas 3{RESET}  scaffold-embeddings:          {'finns' if has_embeds else f'{RED}SAKNAS{RESET}'}")
    print(f"         Matchningstest:                 {DIM}kor via menyval 10{RESET}")
    print()


# ---------------------------------------------------------------------------
# Meny
# ---------------------------------------------------------------------------

def menu():
    print(f"""
{BOLD}+----------------------------------------------------------+
|         Scaffold Pipeline -- Sajtmaskin                   |
+----------------------------------------------------------+{RESET}

  {BOLD}{CYAN}--- Fas 1: Discovery ---{RESET}

  {GREEN} 1{RESET}  Skrapa nya templates fran vercel.com/templates
      {DIM}(Playwright, ~150-200 templates, 5-10 min){RESET}

  {GREEN} 2{RESET}  Importera legacy-dataset fran Desktop/_sidor
      {DIM}(Snabb, anvander befintlig summary.json){RESET}

  {BOLD}{CYAN}--- Fas 2: Build ---{RESET}

  {GREEN} 3{RESET}  Ladda ner repos (hydrate cache)
      {DIM}(Shallow clones av alla repos, 5-15 min){RESET}

  {GREEN} 4{RESET}  Bygg template-library + dossiers
      {DIM}(Analyserar repos, skapar dossiers och generated JSON){RESET}

  {GREEN} 5{RESET}  Generera template-library embeddings
      {DIM}(OpenAI API, ~$0.01){RESET}

  {BOLD}{CYAN}--- Fas 3: Verify ---{RESET}

  {GREEN} 6{RESET}  Generera scaffold embeddings
      {DIM}(OpenAI API for de 10 runtime scaffolds){RESET}

  {GREEN}10{RESET}  Testa scaffold-matchning med svenska prompter
      {DIM}(Kor 20+ testprompter, visar matchkalla och poang){RESET}

  {BOLD}{CYAN}--- Kombinationer ---{RESET}

  {GREEN} 7{RESET}  Kor hela kedjan (import + build + embeddings + test)
  {GREEN} 8{RESET}  Kor ALLT fran scratch (skrapa + build + embeddings + test)

  {GREEN} 9{RESET}  Visa status
  {GREEN} 0{RESET}  Avsluta
""")


# ---------------------------------------------------------------------------
# Fas 1: Discovery
# ---------------------------------------------------------------------------

def step_discover():
    print(f"\n{BOLD}Fas 1: Skrapa templates fran vercel.com{RESET}")
    print("Kor Playwright och besoker vercel.com/templates.")
    print("Kraver: npx playwright install chromium")
    if not confirm("Fortsatt?"):
        return
    run("npm run references:discover")


def step_import_legacy():
    print(f"\n{BOLD}Fas 1: Importera legacy-dataset{RESET}")
    print("Importerar fran Desktop/_sidor/ till discovery/current/")
    run("npm run template-library:import-legacy")


# ---------------------------------------------------------------------------
# Fas 2: Build
# ---------------------------------------------------------------------------

def step_hydrate():
    print(f"\n{BOLD}Fas 2: Ladda ner repos (shallow clones){RESET}")
    if not (RAW_DISCOVERY_CURRENT / "summary.json").exists():
        print(f"{RED}Ingen summary.json hittad i discovery/current/.")
        print(f"Kor steg 1 eller 2 forst.{RESET}")
        return
    run("npm run template-library:hydrate-cache")


def step_build():
    print(f"\n{BOLD}Fas 2: Bygg template-library + dossiers{RESET}")
    run("npm run template-library:build")


def step_template_embeddings():
    print(f"\n{BOLD}Fas 2: Generera template-library embeddings{RESET}")
    print("Anropar OpenAI embedding API (text-embedding-3-small)")
    if not confirm("Fortsatt? (kostar ~$0.01)"):
        return
    run("npm run template-library:embeddings")


# ---------------------------------------------------------------------------
# Fas 3: Verify
# ---------------------------------------------------------------------------

def step_scaffold_embeddings():
    print(f"\n{BOLD}Fas 3: Generera scaffold embeddings{RESET}")
    print("Anropar OpenAI embedding API for de 10 runtime scaffolds")
    if not confirm("Fortsatt?"):
        return
    run("npm run scaffolds:embeddings")


def step_test_matching():
    print(f"\n{BOLD}Fas 3: Testa scaffold-matchning med svenska prompter{RESET}")
    print("Kor testprompter genom matchern och visar resultat.")
    print()

    if not SCAFFOLD_EMBEDDINGS.exists():
        print(f"{RED}scaffold-embeddings.json saknas. Kor steg 6 forst.{RESET}")
        return

    run("npx tsx scripts/test-scaffold-matching.ts")


# ---------------------------------------------------------------------------
# Kombinationer
# ---------------------------------------------------------------------------

def step_full_from_existing():
    print(f"\n{BOLD}Kor hela kedjan fran befintlig discovery{RESET}")
    if not (RAW_DISCOVERY_CURRENT / "summary.json").exists():
        print("Ingen discovery-data hittad. Importerar legacy forst...")
        step_import_legacy()

    step_hydrate()
    step_build()
    step_template_embeddings()
    step_scaffold_embeddings()
    step_test_matching()
    print(f"\n{GREEN}{BOLD}Klart! Hela kedjan kordes.{RESET}")
    show_status()


def step_full_from_scratch():
    print(f"\n{BOLD}Kor ALLT fran scratch{RESET}")
    print("1. Skrapa vercel.com/templates med Playwright")
    print("2. Ladda ner repos + bygg dossiers")
    print("3. Generera embeddings + verifiera matchning")
    if not confirm("Detta tar 15-25 minuter. Fortsatt?"):
        return

    step_discover()
    step_hydrate()
    step_build()
    step_template_embeddings()
    step_scaffold_embeddings()
    step_test_matching()
    print(f"\n{GREEN}{BOLD}Klart! Hela pipelinen kordes fran scratch.{RESET}")
    show_status()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    os.chdir(str(REPO_ROOT))

    while True:
        show_status()
        menu()
        choice = input(f"{BOLD}Valj (0-10): {RESET}").strip()

        actions = {
            "1": step_discover,
            "2": step_import_legacy,
            "3": step_hydrate,
            "4": step_build,
            "5": step_template_embeddings,
            "6": step_scaffold_embeddings,
            "7": step_full_from_existing,
            "8": step_full_from_scratch,
            "9": show_status,
            "10": step_test_matching,
        }

        if choice == "0":
            print(f"\n{GREEN}Hej da!{RESET}")
            break
        elif choice in actions:
            actions[choice]()
        else:
            print(f"{RED}Ogiltigt val. Forsok igen.{RESET}")

        input(f"\n{YELLOW}Tryck Enter for att ga tillbaka till menyn...{RESET}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Avbrutet.{RESET}")
        sys.exit(0)