#!/usr/bin/env python3
"""
Interactive batch helper: call Sajtmaskin's own-engine APIs (HTTP + SSE) without the Builder UI.

Flow:
  1. Ensure app project (POST /api/projects) — session cookie jar
  2. Optional deep brief (POST /api/ai/brief)
  3. Stream generation (POST /api/engine/chats/stream)
  4. Fetch saved files (GET /api/engine/chats/{chatId}/files?versionId=...)

Requires: Python 3.10+, local `npm run dev` (or set SAJTMASKIN_URL).

Env:
  SAJTMASKIN_URL  Base URL, default http://localhost:3000

No third-party packages (stdlib only).
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE = "http://localhost:3000"
MODEL_TIERS = ("fast", "pro", "max", "codex", "anthropic")
SCAFFOLD_MODES = ("auto", "manual", "off")
BUILD_INTENTS = ("website", "app", "template")


def _slugify(text: str, max_len: int = 48) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return (s[:max_len] or "gen").rstrip("-")


def _prompt_line(label: str, default: str | None = None) -> str:
    hint = f" [{default}]" if default is not None else ""
    raw = input(f"{label}{hint}: ").strip()
    if not raw and default is not None:
        return default
    return raw


def _prompt_choice(label: str, options: tuple[str, ...], default: str) -> str:
    print(f"{label}:")
    for i, opt in enumerate(options, 1):
        mark = " (default)" if opt == default else ""
        print(f"  {i}. {opt}{mark}")
    raw = input("Enter number or name: ").strip().lower()
    if not raw:
        return default
    if raw.isdigit():
        idx = int(raw) - 1
        if 0 <= idx < len(options):
            return options[idx]
    for opt in options:
        if raw == opt.lower():
            return opt
    return default


def _prompt_yes_no(label: str, default: bool) -> bool:
    d = "Y/n" if default else "y/N"
    raw = input(f"{label} ({d}): ").strip().lower()
    if not raw:
        return default
    return raw in ("y", "yes", "1", "true", "s", "j")


@dataclass
class SseCollector:
    chat_id: str | None = None
    version_id: str | None = None
    last_done: dict[str, Any] = field(default_factory=dict)
    sandbox_ready: dict[str, Any] = field(default_factory=dict)
    stream_meta: dict[str, Any] = field(default_factory=dict)
    progress_tail: list[dict[str, Any]] = field(default_factory=list)

    def feed(self, event: str, data: Any) -> None:
        if not isinstance(data, dict):
            return
        if event == "chatId" and isinstance(data.get("id"), str):
            self.chat_id = data["id"]
        elif event == "meta":
            self.stream_meta = data
        elif event == "done":
            self.last_done = data
            vid = data.get("versionId")
            if isinstance(vid, str) and vid.strip():
                self.version_id = vid.strip()
        elif event == "sandbox-ready":
            self.sandbox_ready = data
        elif event == "progress":
            self.progress_tail.append(data)
            if len(self.progress_tail) > 80:
                self.progress_tail = self.progress_tail[-80:]


def parse_sse_blocks(buffer: str) -> tuple[list[tuple[str, Any]], str]:
    """Split buffer on blank lines; return (parsed events, remainder)."""
    if "\n\n" not in buffer:
        return [], buffer
    parts = buffer.split("\n\n")
    remainder = parts.pop()
    events: list[tuple[str, Any]] = []
    for block in parts:
        block = block.strip()
        if not block:
            continue
        ev = "message"
        payload: str | None = None
        for line in block.split("\n"):
            if line.startswith("event:"):
                ev = line[len("event:") :].strip()
            elif line.startswith("data:"):
                payload = line[len("data:") :].strip()
        if payload is None:
            continue
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            data = payload
        events.append((ev, data))
    return events, remainder


def stream_sse(
    opener: urllib.request.OpenerDirector,
    url: str,
    body: bytes,
    collector: SseCollector,
    *,
    on_progress_log: bool = True,
) -> None:
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
    )
    resp = opener.open(req, timeout=None)
    try:
        dec_buf = ""
        raw = b""
        while True:
            chunk = resp.read(4096)
            if not chunk:
                break
            raw += chunk
            dec_buf += chunk.decode("utf-8", errors="replace")
            events, dec_buf = parse_sse_blocks(dec_buf)
            for ev, data in events:
                collector.feed(ev, data)
                if on_progress_log and ev == "progress":
                    step = data.get("step") if isinstance(data, dict) else None
                    phase = data.get("phase") if isinstance(data, dict) else None
                    if step or phase:
                        print(f"  … progress: {step or '?'} {phase or ''}".rstrip())
                elif ev == "content" and isinstance(data, str):
                    preview = data if len(data) <= 280 else data[:280] + "…"
                    print(f"  … content: {preview}")
        if dec_buf.strip():
            events, _ = parse_sse_blocks(dec_buf + "\n\n")
            for ev, data in events:
                collector.feed(ev, data)
    finally:
        resp.close()


def json_request(
    opener: urllib.request.OpenerDirector,
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with opener.open(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        status = e.code
        try:
            return status, json.loads(body)
        except json.JSONDecodeError:
            return status, {"error": body}
    try:
        return status, json.loads(body) if body else {}
    except json.JSONDecodeError:
        return status, {"raw": body}


def ensure_project(opener: urllib.request.OpenerDirector, base: str) -> str:
    name = f"builder-generate {time.strftime('%Y-%m-%d %H:%M:%S')}"
    status, data = json_request(opener, "POST", urljoin(base, "/api/projects"), {"name": name})
    if status >= 400:
        raise RuntimeError(f"Create project failed ({status}): {data}")
    proj = data.get("project") if isinstance(data, dict) else None
    if not isinstance(proj, dict) or not proj.get("id"):
        raise RuntimeError(f"Unexpected project response: {data}")
    pid = str(proj["id"])
    print(f"Using project id: {pid}")
    return pid


def fetch_version_files(
    opener: urllib.request.OpenerDirector,
    base: str,
    chat_id: str,
    version_id: str,
) -> tuple[list[dict[str, Any]], str | None]:
    q = (
        f"/api/engine/chats/{urllib.parse.quote(chat_id, safe='')}"
        f"/files?versionId={urllib.parse.quote(version_id, safe='')}"
    )
    status, data = json_request(opener, "GET", urljoin(base, q))
    if status >= 400:
        print(f"Warning: could not fetch files ({status}): {data}")
        return [], None
    if not isinstance(data, dict):
        return [], None
    files = data.get("files")
    vid = data.get("versionId")
    if not isinstance(files, list):
        return [], str(vid) if vid else None
    return files, str(vid) if vid else None


def write_files(out_dir: Path, files: list[dict[str, Any]]) -> int:
    files_root = out_dir / "files"
    n = 0
    for item in files:
        name = item.get("name")
        content = item.get("content")
        if not isinstance(name, str) or not isinstance(content, str):
            continue
        rel = name.replace("\\", "/").lstrip("/")
        if ".." in rel.split("/"):
            print(f"  skip unsafe path: {name}")
            continue
        dest = files_root.joinpath(*rel.split("/"))
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")
        n += 1
    return n


def run_once(base: str) -> None:
    print(f"Base URL: {base}\n")

    message = _prompt_line("Site prompt (required)", "")
    if not message.strip():
        print("Aborted: empty prompt.")
        return

    model_tier = _prompt_choice("Model tier (maps to builder catalog)", MODEL_TIERS, "max")
    deep_brief = _prompt_yes_no("Run deep brief via /api/ai/brief first", False)
    scaffold_mode = _prompt_choice("Scaffold mode", SCAFFOLD_MODES, "auto")
    scaffold_id: str | None = None
    if scaffold_mode == "manual":
        sid = _prompt_line("Scaffold id (required for manual)", "")
        scaffold_id = sid.strip() or None
    build_intent = _prompt_choice("Build intent", BUILD_INTENTS, "website")
    thinking = _prompt_yes_no("Extended thinking", True)
    image_generations = _prompt_yes_no("Image generations", True)

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    project_id = ensure_project(opener, base)

    brief_obj: dict[str, Any] | None = None
    if deep_brief:
        print("\nRequesting deep brief…")
        st, brief_resp = json_request(
            opener,
            "POST",
            urljoin(base, "/api/ai/brief"),
            {"prompt": message, "imageGenerations": image_generations},
        )
        if st >= 400:
            print(f"Deep brief failed ({st}): {brief_resp}")
            if not _prompt_yes_no("Continue without brief", False):
                return
        elif isinstance(brief_resp, dict) and brief_resp.get("error"):
            print(f"Deep brief error: {brief_resp}")
            if not _prompt_yes_no("Continue without brief", False):
                return
        else:
            brief_obj = brief_resp if isinstance(brief_resp, dict) else None
            print("Deep brief OK.")

    meta: dict[str, Any] = {
        "modelTier": model_tier,
        "buildIntent": build_intent,
        "scaffoldMode": scaffold_mode,
    }
    if scaffold_id:
        meta["scaffoldId"] = scaffold_id
    if brief_obj is not None:
        meta["brief"] = brief_obj

    body_obj: dict[str, Any] = {
        "message": message,
        "projectId": project_id,
        "modelId": model_tier,
        "thinking": thinking,
        "imageGenerations": image_generations,
        "meta": meta,
    }

    collector = SseCollector()
    started = time.time()
    print("\nStreaming POST /api/engine/chats/stream …")
    try:
        stream_sse(
            opener,
            urljoin(base, "/api/engine/chats/stream"),
            json.dumps(body_obj).encode("utf-8"),
            collector,
        )
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}: {err_body}")
        return
    except OSError as e:
        print(f"Connection error: {e}")
        return

    elapsed_ms = int((time.time() - started) * 1000)
    chat_id = collector.chat_id
    version_id = collector.version_id

    ts = time.strftime("%Y%m%d-%H%M%S")
    out_name = f"{ts}-{_slugify(message)}"
    out_dir = REPO_ROOT / "output" / "generations" / out_name
    out_dir.mkdir(parents=True, exist_ok=True)

    if brief_obj is not None:
        (out_dir / "brief.json").write_text(
            json.dumps(brief_obj, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    metadata: dict[str, Any] = {
        "baseUrl": base,
        "projectId": project_id,
        "prompt": message,
        "modelId": model_tier,
        "modelTier": model_tier,
        "thinking": thinking,
        "imageGenerations": image_generations,
        "buildIntent": build_intent,
        "scaffoldMode": scaffold_mode,
        "scaffoldId": scaffold_id,
        "deepBrief": bool(brief_obj),
        "chatId": chat_id,
        "versionId": version_id,
        "durationMs": elapsed_ms,
        "done": collector.last_done,
        "sandboxReady": collector.sandbox_ready,
        "streamMeta": collector.stream_meta,
        "progressTail": collector.progress_tail[-40:],
    }

    file_count = 0
    if chat_id and version_id:
        print(f"\nFetching files for version {version_id} …")
        files, resolved_vid = fetch_version_files(opener, base, chat_id, version_id)
        if resolved_vid:
            metadata["resolvedVersionId"] = resolved_vid
        file_count = write_files(out_dir, files)
        metadata["savedFileCount"] = file_count
    else:
        metadata["savedFileCount"] = 0
        if collector.last_done.get("awaitingInput"):
            metadata["note"] = (
                "Generation stopped for user input (e.g. contract clarification). "
                "No version/files to download."
            )
        elif not version_id:
            metadata["note"] = "No versionId in done event; skipped file download."

    (out_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"\nDone in {elapsed_ms} ms")
    print(f"chatId={chat_id!r} versionId={version_id!r}")
    if collector.sandbox_ready.get("sandboxUrl"):
        print(f"sandboxUrl={collector.sandbox_ready['sandboxUrl']}")
    print(f"Wrote: {out_dir}")
    print(f"Files saved: {file_count}")


def main() -> None:
    base = os.environ.get("SAJTMASKIN_URL", DEFAULT_BASE).rstrip("/")
    while True:
        run_once(base)
        if not _prompt_yes_no("\nRun another generation", False):
            break
        print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(130)
