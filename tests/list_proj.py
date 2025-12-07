import requests
import os
import re
from typing import List, Dict, Any, Optional

# *** KLIPP IN DIN RIKTIGA NYCKEL HÄR ***
V0_API_KEY = "v1:wvIe9vSWFEmSYXV5mnG3dAdZ:5do1EQ9ByI4g59VsWwfNXh6W"

BASE_URL = "https://api.v0.dev/v1"


def get_headers(json_request: bool = True) -> Dict[str, str]:
    """
    Standardheaders för alla anrop mot v0 Platform API.
    Vi sätter samma Content-Type som i ditt första (fungerande) skript.
    """
    headers: Dict[str, str] = {
        "Authorization": f"Bearer {V0_API_KEY}",
    }
    if json_request:
        headers["Content-Type"] = "application/json"
    return headers


def fetch_projects() -> List[Dict[str, Any]]:
    """
    Hämtar alla projekt i din workspace.
    """
    url = f"{BASE_URL}/projects"
    resp = requests.get(url, headers=get_headers(json_request=False), timeout=30)

    if resp.status_code != 200:
        print("❌ Misslyckades hämta projekt från v0.")
        print(f"Statuskod: {resp.status_code}")
        print("Rått svar från API:t:")
        print(resp.text)
        raise RuntimeError(f"API error {resp.status_code}")

    data = resp.json()
    return data.get("data", [])


def print_projects(projects: List[Dict[str, Any]]) -> None:
    print("Dina v0-projekt:\n")
    if not projects:
        print("  (Inga projekt hittades)")
        return

    for i, proj in enumerate(projects, start=1):
        print(f"{i}.")
        print(f"   id:       {proj.get('id')}")
        print(f"   name:     {proj.get('name')}")
        print(f"   privacy:  {proj.get('privacy')}")
        print(f"   created:  {proj.get('createdAt')}")
        print()


def resolve_project_id(projects: List[Dict[str, Any]], value: str) -> Optional[str]:
    """
    Tar antingen ett index (1,2,3...) eller ett direkt projectId
    och returnerar ett giltigt projectId, eller None om ogiltigt.
    """
    value = value.strip()

    # Försök tolka som index
    if value.isdigit():
        idx = int(value)
        if 1 <= idx <= len(projects):
            return projects[idx - 1].get("id")
        else:
            return None

    # Annars antar vi att det är ett id
    for proj in projects:
        if proj.get("id") == value:
            return value

    return None


def delete_project(project_id: str) -> bool:
    """
    Raderar ett projekt permanent.
    """
    url = f"{BASE_URL}/projects/{project_id}"
    resp = requests.delete(url, headers=get_headers(json_request=False), timeout=30)

    if resp.status_code == 200:
        try:
            data = resp.json()
            deleted = str(data.get("deleted", "")).lower() == "true"
        except Exception:
            deleted = False

        if deleted:
            print(f"✅ Projekt {project_id} raderat.")
            return True
        else:
            print(f"⚠️ Fick svar men 'deleted' var inte true: {resp.text}")
            return False
    else:
        print(f"⚠️ Misslyckades radera {project_id}: {resp.status_code} {resp.text}")
        return False


def get_project_by_id(project_id: str) -> Dict[str, Any]:
    """
    Hämtar full projektinfo inkl. dess chats och latestVersion.
    """
    url = f"{BASE_URL}/projects/{project_id}"
    resp = requests.get(url, headers=get_headers(json_request=False), timeout=30)

    if resp.status_code != 200:
        print(f"❌ Misslyckades hämta projekt {project_id}")
        print(f"Statuskod: {resp.status_code}")
        print("Rått svar:")
        print(resp.text)
        raise RuntimeError(f"API error {resp.status_code}")

    return resp.json()


def choose_chat_and_version(project: Dict[str, Any]) -> Optional[tuple[str, str]]:
    """
    Väljer ett (chatId, versionId) för projektet.
    Prioriterar chats där latestVersion.status == 'completed'.
    """
    chats = project.get("chats") or []
    if not chats:
        print("❌ Projektet har inga chats (ingen genererad kod ännu?).")
        return None

    def pick_chat(predicate):
        for ch in chats:
            latest = ch.get("latestVersion")
            if latest and predicate(latest):
                return ch
        return None

    chosen = pick_chat(lambda v: v.get("status") == "completed")
    if chosen is None:
        chosen = pick_chat(lambda v: True)

    if chosen is None:
        print("❌ Hittade ingen version på detta projekt.")
        return None

    chat_id = chosen["id"]
    version_id = chosen["latestVersion"]["id"]

    return chat_id, version_id


def slugify(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "project"


def download_project_zip(project_id: str, out_dir: str = "exports") -> Optional[str]:
    """
    Laddar ned senaste versionen av projektet som ZIP.

    Flow:
      1) GET /v1/projects/{projectId}
      2) välj chat + latestVersion
      3) GET /v1/chats/{chatId}/versions/{versionId}/download?format=zip&includeDefaultFiles=true
    """
    project = get_project_by_id(project_id)
    name = project.get("name", "project")

    pair = choose_chat_and_version(project)
    if pair is None:
        return None

    chat_id, version_id = pair

    url = f"{BASE_URL}/chats/{chat_id}/versions/{version_id}/download"
    params = {
        "format": "zip",
        "includeDefaultFiles": "true",
    }

    # Viktigt: här skickar vi INTE Content-Type: application/json
    # eftersom vi hämtar binär data (zip)
    resp = requests.get(url, headers=get_headers(json_request=False), params=params, timeout=60)

    if resp.status_code != 200:
        print(f"❌ Misslyckades ladda ned version: {resp.status_code} {resp.text}")
        return None

    os.makedirs(out_dir, exist_ok=True)
    filename = f"{slugify(name)}-{project_id}.zip"
    full_path = os.path.join(out_dir, filename)

    with open(full_path, "wb") as f:
        f.write(resp.content)

    print(f"✅ ZIP nedladdad: {full_path}")
    return full_path


def bulk_delete_by_name(projects: List[Dict[str, Any]], pattern: str) -> None:
    """
    Raderar alla projekt där namnet innehåller pattern (case-insensitive).
    """
    pattern_lower = pattern.lower()

    to_delete = [
        p for p in projects
        if pattern_lower in (p.get("name") or "").lower()
    ]

    if not to_delete:
        print(f"Inga projekt matchade '{pattern}'.")
        return

    print("\nFöljande projekt kommer raderas:")
    for p in to_delete:
        print(f"- {p.get('id')} | {p.get('name')}")

    confirm = input("\nSkriv 'ja' för att bekräfta radering: ").strip().lower()
    if confirm != "ja":
        print("❌ Avbrutet.")
        return

    for p in to_delete:
        delete_project(p.get("id"))


def main() -> None:
    print("🔑 v0-projekt-CLI")
    print("-----------------\n")

    try:
        projects = fetch_projects()
    except Exception as e:
        print(f"❌ Kunde inte hämta projekt: {e}")
        return

    print_projects(projects)

    while True:
        print("Välj alternativ:")
        print("  [d] Radera ett projekt")
        print("  [b] Bulk-radera (namn matchar text)")
        print("  [z] Ladda hem projekt som ZIP")
        print("  [r] Ladda om och lista projekt")
        print("  [q] Avsluta")
        choice = input("> ").strip().lower()

        if choice == "q":
            print("Hejdå 👋")
            break

        elif choice == "r":
            try:
                projects = fetch_projects()
                print_projects(projects)
            except Exception as e:
                print(f"❌ Kunde inte hämta projekt: {e}")

        elif choice == "d":
            target = input("Index eller projectId att radera: ").strip()
            proj_id = resolve_project_id(projects, target)
            if not proj_id:
                print("❌ Ogiltigt index/id.")
                continue

            confirm = input(f"Är du säker på att du vill radera {proj_id}? (ja/nej): ").strip().lower()
            if confirm != "ja":
                print("Avbrutet.")
                continue

            delete_project(proj_id)

        elif choice == "b":
            pattern = input("Text som ska finnas i projektnamnet: ").strip()
            if not pattern:
                print("❌ Tomt mönster.")
                continue
            bulk_delete_by_name(projects, pattern)

        elif choice == "z":
            target = input("Index eller projectId att ladda hem som ZIP: ").strip()
            proj_id = resolve_project_id(projects, target)
            if not proj_id:
                print("❌ Ogiltigt index/id.")
                continue

            out_dir = input("Mapp för ZIP (Enter = ./exports): ").strip() or "exports"
            download_project_zip(proj_id, out_dir=out_dir)

        else:
            print("❌ Okänt val.\n")


if __name__ == "__main__":
    main()
