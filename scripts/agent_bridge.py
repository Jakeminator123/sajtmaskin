#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sajtmaskin Agent Bridge v1 — mailbox to GitHub issue #1468.

Never executes GitHub comment text. Never git push, merge, or checkout.
Writes only bridge comments and local `.agent-bridge/` state files.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

PROTOCOL_VERSION = "v1"
AGENT_MARKER = "[AGENT→COACH:v1]"
COACH_MARKER_V1 = "[COACH→AGENT:v1]"
COACH_MARKER_LEGACY = "[COACH→AGENT]"
PLACEHOLDER_REPOSITORY = "owner/repo"
DEFAULT_BRIDGE_ISSUE = 1468
# BRYGG-01 is the only identity v1 activates. The three specialised roles stay
# defined so a later split needs no protocol change, but they are parked until
# one bryggagent has completed a full post -> coach -> read round.
ALLOWED_IDENTITIES: dict[str, str] = {
    "BRYGG-01": "brygg",
    "MERGE-01": "merge",
    "BUILD-01": "builder",
    "SCOUT-01": "scout",
}
ACTIVE_IDENTITY = "BRYGG-01"
ALLOWED_STATUSES = frozenset({"QUESTION", "BLOCKED", "READY", "DONE", "REPORT"})
ALLOWED_RISKS = frozenset({"low", "medium", "high"})
REQUIRED_CONFIG_KEYS = ("agent_id", "role", "repository", "bridge_issue")
OPTIONAL_CONFIG_KEYS = ("coach_authors",)
# Fail-closed floor: same GitHub identity as trustedAccountReviewActors.
DEFAULT_COACH_AUTHORS: tuple[str, ...] = ("Jakeminator123",)
GITHUB_LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
REPO_SLUG_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
REMOTE_SLUG_RE = re.compile(
    r"(?:github\.com[:/])(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+)",
    re.IGNORECASE,
)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REQUEST_ID_RE = re.compile(r"^[A-Z]+-[0-9]{2}-[0-9]{8}T[0-9]{6}Z-[0-9]+$")
COACH_SCALAR_KEYS = frozenset(
    {
        "request_id",
        "in_reply_to",
        "agent_id",
        "role",
        "task",
        "decision",
        "priority",
    }
)
COACH_MULTILINE_KEYS = frozenset({"message", "evidence", "requested_decision", "guards"})
TOKEN_RE = re.compile(
    r"(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}"
    r"|sk-[A-Za-z0-9]{20,}"
    r"|Bearer\s+[A-Za-z0-9._\-]{20,}",
    re.IGNORECASE,
)
MAX_CONFIG_BYTES = 8192
MAX_MESSAGE_CHARS = 8000
MAX_COMMENT_CHARS = 256_000
MAX_WAIT_TIMEOUT = 300
MAX_WAIT_INTERVAL = 60
GIT_BIN = "git"
GH_BIN = "gh"
ALLOWED_BINARIES = frozenset({GIT_BIN, GH_BIN})

EXIT_OK = 0
EXIT_USAGE = 1
EXIT_DEPENDENCY = 2
EXIT_NO_RESPONSE = 3


class BridgeError(Exception):
    def __init__(self, message: str, *, code: int = EXIT_USAGE) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Config:
    agent_id: str
    role: str
    repository: str
    bridge_issue: int
    coach_authors: tuple[str, ...]


@dataclass
class BridgePaths:
    root: Path
    config: Path
    state: Path
    latest_response: Path
    work_dir: Path


@dataclass
class CommandResult:
    argv: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str


@dataclass(frozen=True)
class PullRequestRef:
    number: int
    url: str


@dataclass
class GitSnapshot:
    branch: str
    head: str
    preview_sha: str
    dirty: bool


@dataclass
class CoachComment:
    marker: str
    version: int
    body: str
    created_at: str
    html_url: str
    comment_id: int
    author: str = ""
    fields: dict[str, str] = field(default_factory=dict)

    @property
    def agent_id(self) -> str:
        return self.fields.get("agent_id", "").strip()

    @property
    def request_id(self) -> str:
        return self.fields.get("request_id", "").strip()


class CommandRunner:
    def run(self, argv: Sequence[str], *, cwd: Path, timeout: int = 30) -> CommandResult:
        if not argv:
            raise BridgeError("empty command")
        binary = Path(str(argv[0])).name
        if binary not in ALLOWED_BINARIES and binary not in {f"{name}.exe" for name in ALLOWED_BINARIES}:
            raise BridgeError(f"refusing to run unexpected binary: {binary}")
        try:
            completed = subprocess.run(
                list(argv),
                cwd=str(cwd),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
                shell=False,
            )
        except FileNotFoundError as exc:
            raise BridgeError(f"{argv[0]} is not installed", code=EXIT_DEPENDENCY) from exc
        except subprocess.TimeoutExpired as exc:
            raise BridgeError(f"{argv[0]} timed out", code=EXIT_DEPENDENCY) from exc
        return CommandResult(
            argv=tuple(str(part) for part in argv),
            returncode=int(completed.returncode),
            stdout=completed.stdout or "",
            stderr=completed.stderr or "",
        )


def redact_secrets(text: str) -> str:
    return TOKEN_RE.sub("[redacted]", text or "")


def _reject_json_constant(value: str) -> Any:
    raise ValueError(f"disallowed JSON constant: {value}")


def _no_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    seen: set[str] = set()
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError(f"duplicate config key: {key}")
        seen.add(key)
        result[key] = value
    return result


def parse_config_text(text: str) -> Config:
    if len(text.encode("utf-8")) > MAX_CONFIG_BYTES:
        raise BridgeError("config file is too large")
    try:
        raw = json.loads(
            text,
            parse_constant=_reject_json_constant,
            object_pairs_hook=_no_duplicate_keys,
        )
    except json.JSONDecodeError as exc:
        raise BridgeError(f"config is not strict JSON: {exc}") from exc
    except ValueError as exc:
        raise BridgeError(f"config is not strict JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise BridgeError("config must be a JSON object")
    extra = sorted(set(raw) - set(REQUIRED_CONFIG_KEYS) - set(OPTIONAL_CONFIG_KEYS))
    missing = [key for key in REQUIRED_CONFIG_KEYS if key not in raw]
    if extra:
        raise BridgeError(f"config has unknown keys: {', '.join(extra)}")
    if missing:
        raise BridgeError(f"config missing keys: {', '.join(missing)}")
    agent_id = raw["agent_id"]
    role = raw["role"]
    repository = raw["repository"]
    bridge_issue = raw["bridge_issue"]
    if not isinstance(agent_id, str) or agent_id not in ALLOWED_IDENTITIES:
        raise BridgeError(f"agent_id must be one of: {', '.join(ALLOWED_IDENTITIES)}")
    if not isinstance(role, str):
        raise BridgeError("role must be a string")
    expected_role = ALLOWED_IDENTITIES[agent_id]
    if role != expected_role:
        raise BridgeError(f"agent/role mismatch: {agent_id} must use role {expected_role}")
    if not isinstance(repository, str) or not REPO_SLUG_RE.fullmatch(repository):
        raise BridgeError("repository must be owner/name")
    if repository == PLACEHOLDER_REPOSITORY:
        raise BridgeError("repository is still the example placeholder; set it to this checkout's origin slug")
    if not isinstance(bridge_issue, int) or isinstance(bridge_issue, bool):
        raise BridgeError("bridge_issue must be an integer")
    if bridge_issue != DEFAULT_BRIDGE_ISSUE:
        raise BridgeError(f"bridge_issue must be {DEFAULT_BRIDGE_ISSUE}")
    if "coach_authors" in raw:
        coach_authors = parse_coach_authors(raw["coach_authors"])
    else:
        coach_authors = DEFAULT_COACH_AUTHORS
    return Config(
        agent_id=agent_id,
        role=role,
        repository=repository,
        bridge_issue=bridge_issue,
        coach_authors=coach_authors,
    )


def parse_coach_authors(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise BridgeError("coach_authors must be a JSON array of GitHub usernames")
    if not value:
        raise BridgeError("coach_authors must not be empty")
    seen: set[str] = set()
    authors: list[str] = []
    for item in value:
        if not isinstance(item, str) or not GITHUB_LOGIN_RE.fullmatch(item):
            raise BridgeError("coach_authors entries must be GitHub usernames")
        folded = item.casefold()
        if folded in seen:
            raise BridgeError("coach_authors has duplicate usernames")
        seen.add(folded)
        authors.append(item)
    return tuple(authors)


def comment_login(item: Mapping[str, Any]) -> str | None:
    user = item.get("user")
    if not isinstance(user, dict):
        return None
    login = user.get("login")
    if not isinstance(login, str):
        return None
    cleaned = login.strip()
    return cleaned or None


def is_trusted_coach_author(login: str | None, allowed: Sequence[str]) -> bool:
    if not login or not allowed:
        return False
    trusted = {author.casefold() for author in allowed}
    return login.casefold() in trusted


def load_config(path: Path) -> Config:
    if not path.is_file():
        raise BridgeError(
            f"missing {path}. Copy .agent-bridge/config.example.json to config.local.json"
        )
    return parse_config_text(path.read_text(encoding="utf-8"))


def parse_remote_slug(url: str) -> str:
    cleaned = re.sub(r"^https?://[^@\s]+@", "https://", (url or "").strip())
    match = REMOTE_SLUG_RE.search(cleaned)
    if not match:
        raise BridgeError("could not parse owner/repo from git origin")
    repo = match.group("repo")
    if repo.endswith(".git"):
        repo = repo[: -len(".git")]
    return f"{match.group('owner')}/{repo}"


def detect_origin_slug(runner: CommandRunner, root: Path) -> str:
    return parse_remote_slug(_git_text(runner, root, ["remote", "get-url", "origin"]))


def assert_repository_matches_origin(config: Config, origin_slug: str) -> None:
    if config.repository != origin_slug:
        raise BridgeError("config repository does not match git origin")


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        git_entry = candidate / ".git"
        if git_entry.exists() and (candidate / "package.json").is_file():
            return candidate
    raise BridgeError("could not find the sajtmaskin repository root")


def resolve_paths(root: Path | None = None) -> BridgePaths:
    repo = root or find_repo_root()
    work_dir = repo / ".agent-bridge"
    work_dir.mkdir(parents=True, exist_ok=True)
    return BridgePaths(
        root=repo,
        config=work_dir / "config.local.json",
        state=work_dir / "state.json",
        latest_response=work_dir / "latest-response.md",
        work_dir=work_dir,
    )


def load_state(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return raw if isinstance(raw, dict) else {}


def save_state(path: Path, state: Mapping[str, Any]) -> None:
    _assert_bridge_write(path)
    path.write_text(json.dumps(dict(state), indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _assert_bridge_write(path: Path) -> None:
    resolved = path.resolve()
    if resolved.name not in {"state.json", "latest-response.md"} or resolved.parent.name != ".agent-bridge":
        raise BridgeError(f"refusing write outside bridge state files: {resolved.name}")


def utc_stamp(now: datetime | None = None) -> str:
    current = now or datetime.now(timezone.utc)
    return current.strftime("%Y%m%dT%H%M%SZ")


def make_request_id(agent_id: str, sequence: int, now: datetime | None = None) -> str:
    if agent_id not in ALLOWED_IDENTITIES:
        raise BridgeError("invalid agent_id for request_id")
    if sequence < 1:
        raise BridgeError("request_id sequence must be >= 1")
    request_id = f"{agent_id}-{utc_stamp(now)}-{sequence}"
    if not REQUEST_ID_RE.fullmatch(request_id):
        raise BridgeError("internal request_id format error")
    return request_id


def next_request_id(agent_id: str, state: Mapping[str, Any], now: datetime | None = None) -> tuple[str, int]:
    sequence = int(state.get("sequence") or 0) + 1
    return make_request_id(agent_id, sequence, now), sequence


def git_snapshot(runner: CommandRunner, root: Path) -> GitSnapshot:
    branch = _git_text(runner, root, ["rev-parse", "--abbrev-ref", "HEAD"]) or "n/a"
    head = _git_text(runner, root, ["rev-parse", "HEAD"])
    if head and not SHA_RE.fullmatch(head):
        raise BridgeError("git HEAD was not a 40-char SHA")
    preview = _git_text(runner, root, ["rev-parse", "origin/preview"], required=False)
    if preview and not SHA_RE.fullmatch(preview):
        preview = ""
    porcelain = _git_text(runner, root, ["status", "--porcelain"], required=False)
    return GitSnapshot(
        branch=branch,
        head=head or "n/a",
        preview_sha=preview or "n/a",
        dirty=bool(porcelain.strip()),
    )


def _git_text(
    runner: CommandRunner,
    root: Path,
    args: Sequence[str],
    *,
    required: bool = True,
) -> str:
    result = runner.run([GIT_BIN, *args], cwd=root)
    if result.returncode != 0:
        if required:
            raise BridgeError(f"git {' '.join(args)} failed", code=EXIT_DEPENDENCY)
        return ""
    return result.stdout.strip()


def ensure_gh(runner: CommandRunner, root: Path) -> None:
    result = runner.run([GH_BIN, "auth", "status"], cwd=root, timeout=20)
    if result.returncode != 0:
        raise BridgeError("gh is not authenticated", code=EXIT_DEPENDENCY)


def find_current_pr(
    runner: CommandRunner, root: Path, repository: str, branch: str | None
) -> PullRequestRef | None:
    """Resolve the open PR whose head is exactly `branch`.

    `gh pr view --repo <slug>` cannot infer the branch: it exits non-zero with
    "argument required when using the --repo flag". The old call therefore
    reported `pr: n/a` on every post and made `--pr` unusable. Querying the
    exact head keeps `--repo` explicit and cannot pick up an unrelated PR, so
    an ambiguous result is treated as "no PR" rather than guessed.
    """
    if not branch or branch == "HEAD":
        return None
    result = runner.run(
        [
            GH_BIN,
            "pr",
            "list",
            "--repo",
            repository,
            "--head",
            branch,
            "--state",
            "open",
            "--json",
            "number,url,headRefName",
        ],
        cwd=root,
    )
    if result.returncode != 0:
        return None
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, list):
        return None
    matches = [
        row for row in payload if isinstance(row, dict) and row.get("headRefName") == branch
    ]
    if len(matches) != 1:
        return None
    number = matches[0].get("number")
    url = matches[0].get("url")
    if not isinstance(number, int) or isinstance(number, bool) or number < 1:
        return None
    if not isinstance(url, str) or not url.startswith("https://github.com/"):
        return None
    return PullRequestRef(number=number, url=url)


def validate_reply_to(value: str, agent_id: str) -> str:
    """Validate the coach `request_id` this post answers.

    Deliberately not an override of the post's own `request_id`:
    `select_coach_response` re-admits a comment created before our post when
    its `request_id` matches, so reusing the coach id would make `wait` match
    the coach's own task comment again and report it as a fresh reply.
    """
    candidate = value.strip()
    if not REQUEST_ID_RE.fullmatch(candidate):
        raise BridgeError("reply-to must be a full request_id like BRYGG-01-20260918T002000Z-1")
    if not candidate.startswith(f"{agent_id}-"):
        raise BridgeError(f"reply-to must belong to {agent_id}; refusing another agent's thread")
    return candidate


def sanitize_user_text(value: str, *, field_name: str) -> str:
    if "\x00" in value:
        raise BridgeError(f"{field_name} contains NUL")
    cleaned = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if len(cleaned) > MAX_MESSAGE_CHARS:
        raise BridgeError(f"{field_name} is too long")
    return cleaned


def format_agent_message(
    *,
    config: Config,
    git: GitSnapshot,
    status: str,
    message: str,
    request_id: str,
    risk: str = "medium",
    task: str | None = None,
    evidence: Sequence[str] | None = None,
    requested_decision: str | None = None,
    pr: PullRequestRef | None = None,
    in_reply_to: str | None = None,
) -> str:
    if status not in ALLOWED_STATUSES:
        raise BridgeError("status must be QUESTION, BLOCKED, READY, DONE, or REPORT")
    if risk not in ALLOWED_RISKS:
        raise BridgeError("risk must be low, medium, or high")
    body = sanitize_user_text(message, field_name="message")
    if not body:
        raise BridgeError("message is required")
    decision = sanitize_user_text(requested_decision or "n/a", field_name="requested_decision")
    task_value = sanitize_user_text(task or (f"#{pr.number}" if pr else "n/a"), field_name="task")
    items = [sanitize_user_text(item, field_name="evidence") for item in (evidence or []) if item.strip()]
    if not items:
        items = ["n/a"]
    evidence_lines = [item if item.startswith("- ") else f"- {item}" for item in items]
    pr_number = f"#{pr.number}" if pr else "n/a"
    pr_url = pr.url if pr else "n/a"
    return "\n".join(
        [
            AGENT_MARKER,
            "",
            f"request_id: {request_id}",
            *([f"in_reply_to: {in_reply_to}"] if in_reply_to else []),
            f"agent_id: {config.agent_id}",
            f"role: {config.role}",
            f"task: {task_value}",
            f"branch: {git.branch}",
            f"head: {git.head}",
            f"base: {git.preview_sha}",
            f"status: {status}",
            f"risk: {risk}",
            f"pr: {pr_number}",
            f"pr_url: {pr_url}",
            f"git_status: {'dirty' if git.dirty else 'clean'}",
            "",
            "message:",
            body,
            "",
            "evidence:",
            *evidence_lines,
            "",
            "requested_decision:",
            decision,
            "",
        ]
    )


def first_nonempty_line(body: str) -> str:
    for raw_line in body.replace("\r\n", "\n").split("\n"):
        stripped = raw_line.strip()
        if stripped:
            return stripped
    return ""


def correlatable_request_id(request_id: str | None, state: Mapping[str, Any]) -> str | None:
    wanted = (request_id or str(state.get("last_request_id") or "") or "").strip()
    if wanted and REQUEST_ID_RE.fullmatch(wanted):
        return wanted
    return None


def parse_coach_fields(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    current: str | None = None
    chunks: list[str] = []

    def flush() -> None:
        nonlocal current, chunks
        if current is None:
            return
        fields[current] = "\n".join(chunks).strip()
        current = None
        chunks = []

    for raw_line in body.replace("\r\n", "\n").split("\n"):
        line = raw_line.rstrip()
        if line in {COACH_MARKER_V1, COACH_MARKER_LEGACY, AGENT_MARKER}:
            continue
        match = re.fullmatch(r"([a-z_]+):\s*(.*)", line)
        if match:
            key = match.group(1)
            value = match.group(2)
            if current in COACH_MULTILINE_KEYS:
                if key in COACH_MULTILINE_KEYS:
                    flush()
                    current = key
                    chunks = [value] if value else []
                    continue
                chunks.append(line)
                continue
            if key in COACH_MULTILINE_KEYS:
                flush()
                current = key
                chunks = [value] if value else []
                continue
            if key in COACH_SCALAR_KEYS:
                flush()
                fields[key] = value.strip()
                continue
        if current is not None:
            chunks.append(line)
    flush()
    return fields


def flatten_github_pages(payload: Any) -> list[Any]:
    if not isinstance(payload, list):
        raise BridgeError("GitHub comment payload was not a JSON array")
    if not payload:
        return []
    if all(isinstance(item, list) for item in payload):
        flat: list[Any] = []
        for page in payload:
            flat.extend(page)
        return flat
    if all(isinstance(item, dict) for item in payload):
        return payload
    raise BridgeError("GitHub comment payload had mixed page shapes")


def parse_github_comment_pages(text: str) -> list[Any]:
    decoder = json.JSONDecoder()
    index = 0
    values: list[Any] = []
    while index < len(text):
        while index < len(text) and text[index].isspace():
            index += 1
        if index >= len(text):
            break
        try:
            value, end = decoder.raw_decode(text, index)
        except json.JSONDecodeError as exc:
            raise BridgeError("GitHub comment payload was not JSON") from exc
        values.append(value)
        index = end
    if not values:
        raise BridgeError("GitHub comment payload was empty")
    if len(values) == 1:
        return flatten_github_pages(values[0])
    pages: list[Any] = []
    for value in values:
        pages.extend(flatten_github_pages(value))
    return pages


def parse_coach_comments(
    raw_comments: Any,
    *,
    allowed_authors: Sequence[str] | None = None,
) -> list[CoachComment]:
    allowed = tuple(allowed_authors) if allowed_authors is not None else DEFAULT_COACH_AUTHORS
    if not isinstance(raw_comments, list) or not allowed:
        return []
    parsed: list[CoachComment] = []
    for item in raw_comments:
        if not isinstance(item, dict):
            continue
        author = comment_login(item)
        if not is_trusted_coach_author(author, allowed):
            continue
        body = item.get("body")
        if not isinstance(body, str) or len(body) > MAX_COMMENT_CHARS:
            continue
        first = first_nonempty_line(body)
        if first == COACH_MARKER_V1:
            marker = COACH_MARKER_V1
            version = 1
        elif first == COACH_MARKER_LEGACY:
            marker = COACH_MARKER_LEGACY
            version = 0
        else:
            continue
        comment_id = item.get("id")
        if not isinstance(comment_id, int):
            continue
        parsed.append(
            CoachComment(
                marker=marker,
                version=version,
                body=body[:MAX_COMMENT_CHARS],
                created_at=str(item.get("created_at") or ""),
                html_url=str(item.get("html_url") or ""),
                comment_id=comment_id,
                author=author or "",
                fields=parse_coach_fields(body),
            )
        )
    return parsed


def select_coach_response(
    comments: Sequence[CoachComment],
    *,
    agent_id: str,
    request_id: str | None = None,
    posted_at: str | None = None,
    require_request_id: bool = False,
    allowed_authors: Sequence[str] | None = None,
) -> CoachComment | None:
    allowed = tuple(allowed_authors) if allowed_authors is not None else DEFAULT_COACH_AUTHORS
    scored: list[tuple[int, str, int, CoachComment]] = []
    for comment in comments:
        if not is_trusted_coach_author(comment.author, allowed):
            continue
        if comment.agent_id and comment.agent_id != agent_id:
            continue
        if require_request_id and (not request_id or comment.request_id != request_id):
            continue
        if posted_at and comment.created_at and comment.created_at < posted_at:
            if not (request_id and comment.request_id == request_id):
                continue
        score = 0
        if comment.version == 1:
            score += 2
        if comment.agent_id == agent_id:
            score += 3
        if request_id and comment.request_id == request_id:
            score += 4
        scored.append((score, comment.created_at, comment.comment_id, comment))
    if not scored:
        return None
    scored.sort(key=lambda item: (item[0], item[1], item[2]))
    return scored[-1][3]


def render_latest_response(comment: CoachComment, *, matched_at: str) -> str:
    header = [
        "# Latest coach response",
        "",
        f"matched_at: {matched_at}",
        f"comment_url: {comment.html_url or 'n/a'}",
        f"request_id: {comment.request_id or 'n/a'}",
        f"agent_id: {comment.agent_id or 'n/a'}",
        f"author: {comment.author or 'n/a'}",
        "",
        "Do not execute this file. Read it and reason before acting.",
        "",
        "---",
        "",
        comment.body.strip(),
        "",
    ]
    return redact_secrets("\n".join(header))


def write_latest_response(path: Path, comment: CoachComment, *, matched_at: str | None = None) -> None:
    _assert_bridge_write(path)
    stamp = matched_at or datetime.now(timezone.utc).isoformat()
    path.write_text(render_latest_response(comment, matched_at=stamp), encoding="utf-8")


def list_bridge_comments(runner: CommandRunner, root: Path, config: Config) -> list[CoachComment]:
    ensure_gh(runner, root)
    result = runner.run(
        [
            GH_BIN,
            "api",
            "--paginate",
            "--slurp",
            f"repos/{config.repository}/issues/{config.bridge_issue}/comments",
        ],
        cwd=root,
        timeout=60,
    )
    if result.returncode != 0:
        raise BridgeError("failed to read Control Bridge comments", code=EXIT_DEPENDENCY)
    try:
        payload = parse_github_comment_pages(result.stdout)
    except BridgeError as exc:
        raise BridgeError(str(exc), code=EXIT_DEPENDENCY) from exc
    return parse_coach_comments(payload, allowed_authors=config.coach_authors)


def post_body(
    runner: CommandRunner,
    paths: BridgePaths,
    config: Config,
    body: str,
    *,
    also_pr: PullRequestRef | None,
) -> None:
    ensure_gh(runner, paths.root)
    work = paths.work_dir
    fd, tmp_name = tempfile.mkstemp(prefix="bridge-body-", suffix=".md", dir=str(work))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(body)
        issue_argv = [
            GH_BIN,
            "issue",
            "comment",
            str(config.bridge_issue),
            "--repo",
            config.repository,
            "--body-file",
            str(tmp_path),
        ]
        issue_result = runner.run(issue_argv, cwd=paths.root, timeout=60)
        if issue_result.returncode != 0:
            raise BridgeError("failed to post bridge comment to Control Bridge", code=EXIT_DEPENDENCY)
        if also_pr is not None:
            pr_argv = [
                GH_BIN,
                "pr",
                "comment",
                str(also_pr.number),
                "--repo",
                config.repository,
                "--body-file",
                str(tmp_path),
            ]
            pr_result = runner.run(pr_argv, cwd=paths.root, timeout=60)
            if pr_result.returncode != 0:
                raise BridgeError(
                    "posted to Control Bridge but failed to copy the comment to the current PR",
                    code=EXIT_DEPENDENCY,
                )
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


def cmd_identity(config: Config, *, runner: CommandRunner, root: Path) -> int:
    assert_repository_matches_origin(config, detect_origin_slug(runner, root))
    print(f"agent_id: {config.agent_id}")
    print(f"role: {config.role}")
    print(f"repository: {config.repository}")
    print(f"bridge_issue: {config.bridge_issue}")
    print(f"coach_authors: {', '.join(config.coach_authors)}")
    return EXIT_OK


def cmd_post(
    *,
    runner: CommandRunner,
    paths: BridgePaths,
    config: Config,
    status: str,
    message: str,
    risk: str,
    task: str | None,
    evidence: Sequence[str],
    requested_decision: str | None,
    post_to_pr: bool,
    dry_run: bool,
    reply_to: str | None = None,
    now: datetime | None = None,
) -> int:
    assert_repository_matches_origin(config, detect_origin_slug(runner, paths.root))
    in_reply_to = validate_reply_to(reply_to, config.agent_id) if reply_to else None
    git = git_snapshot(runner, paths.root)
    pr = None
    if not dry_run or post_to_pr:
        try:
            if not dry_run:
                ensure_gh(runner, paths.root)
            pr = find_current_pr(runner, paths.root, config.repository, git.branch)
        except BridgeError:
            if post_to_pr or not dry_run:
                raise
    else:
        try:
            pr = find_current_pr(runner, paths.root, config.repository, git.branch)
        except BridgeError:
            pr = None
    if post_to_pr and pr is None:
        raise BridgeError("current branch has no pull request", code=EXIT_DEPENDENCY)
    state = load_state(paths.state)
    request_id, sequence = next_request_id(config.agent_id, state, now)
    body = format_agent_message(
        config=config,
        git=git,
        status=status,
        message=message,
        request_id=request_id,
        risk=risk,
        task=task,
        evidence=evidence,
        requested_decision=requested_decision,
        pr=pr,
        in_reply_to=in_reply_to,
    )
    if dry_run:
        print(redact_secrets(body), end="")
        return EXIT_OK
    post_body(runner, paths, config, body, also_pr=pr if post_to_pr else None)
    posted_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    save_state(
        paths.state,
        {
            "last_request_id": request_id,
            "last_posted_at": posted_at,
            "sequence": sequence,
            "last_status": status,
        },
    )
    if post_to_pr and pr:
        print(f"posted {request_id} to issue #{config.bridge_issue} and copied to PR #{pr.number}")
    else:
        print(f"posted {request_id} to issue #{config.bridge_issue}")
    return EXIT_OK


def cmd_read(
    *,
    runner: CommandRunner,
    paths: BridgePaths,
    config: Config,
    request_id: str | None = None,
    require_request_id: bool = False,
) -> int:
    assert_repository_matches_origin(config, detect_origin_slug(runner, paths.root))
    state = load_state(paths.state)
    wanted = correlatable_request_id(request_id, state)
    if require_request_id and wanted is None:
        print("read/wait requires a correlatable request_id", file=sys.stderr)
        return EXIT_USAGE
    comments = list_bridge_comments(runner, paths.root, config)
    match = select_coach_response(
        comments,
        agent_id=config.agent_id,
        request_id=wanted,
        posted_at=str(state.get("last_posted_at") or "") or None,
        require_request_id=require_request_id,
        allowed_authors=config.coach_authors,
    )
    if match is None:
        print("No matching [COACH→AGENT:v1] response yet.", file=sys.stderr)
        return EXIT_NO_RESPONSE
    write_latest_response(paths.latest_response, match)
    print(f"wrote {paths.latest_response}")
    return EXIT_OK


def cmd_wait(
    *,
    runner: CommandRunner,
    paths: BridgePaths,
    config: Config,
    timeout: int,
    interval: int,
    request_id: str | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
    now_fn: Callable[[], float] = time.monotonic,
) -> int:
    if timeout < 1 or timeout > MAX_WAIT_TIMEOUT:
        raise BridgeError(f"timeout must be 1..{MAX_WAIT_TIMEOUT}")
    if interval < 1 or interval > MAX_WAIT_INTERVAL:
        raise BridgeError(f"interval must be 1..{MAX_WAIT_INTERVAL}")
    wanted = correlatable_request_id(request_id, load_state(paths.state))
    if wanted is None:
        raise BridgeError("wait requires a correlatable request_id")
    request_id = wanted
    deadline = now_fn() + timeout
    last_code = EXIT_NO_RESPONSE
    while True:
        last_code = cmd_read(
            runner=runner,
            paths=paths,
            config=config,
            request_id=request_id,
            require_request_id=True,
        )
        if last_code == EXIT_OK:
            return EXIT_OK
        remaining = deadline - now_fn()
        if remaining <= 0:
            break
        sleep_fn(min(interval, remaining))
    print("Timed out waiting for a coach response.", file=sys.stderr)
    return last_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agent_bridge.py", description="Sajtmaskin Agent Bridge v1")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("identity", help="print and validate the locked local identity")
    post = sub.add_parser("post", help="post [AGENT→COACH:v1] to issue #1468")
    post.add_argument("--status", required=True, choices=sorted(ALLOWED_STATUSES))
    post.add_argument("--message", required=True)
    post.add_argument("--task")
    post.add_argument("--risk", default="medium", choices=sorted(ALLOWED_RISKS))
    post.add_argument("--evidence", action="append", default=[])
    post.add_argument("--requested-decision")
    post.add_argument(
        "--reply-to",
        help="coach request_id this post answers; adds in_reply_to without reusing it as our own id",
    )
    post.add_argument(
        "--pr",
        action="store_true",
        help="also copy the message to the current PR; Control Bridge #1468 remains owner",
    )
    post.add_argument("--dry-run", action="store_true")
    read = sub.add_parser("read", help="read latest matching [COACH→AGENT:v1]")
    read.add_argument("--request-id")
    wait = sub.add_parser("wait", help="poll GitHub for a matching coach reply")
    wait.add_argument("--timeout", type=int, default=MAX_WAIT_TIMEOUT)
    wait.add_argument("--interval", type=int, default=10)
    wait.add_argument("--request-id")
    return parser


def main(argv: Sequence[str] | None = None, *, runner: CommandRunner | None = None, paths: BridgePaths | None = None) -> int:
    args = build_parser().parse_args(list(argv) if argv is not None else None)
    active_runner = runner or CommandRunner()
    active_paths = paths or resolve_paths()
    try:
        config = load_config(active_paths.config)
        if args.command == "identity":
            return cmd_identity(config, runner=active_runner, root=active_paths.root)
        if args.command == "post":
            return cmd_post(
                runner=active_runner,
                paths=active_paths,
                config=config,
                status=args.status,
                message=args.message,
                risk=args.risk,
                task=args.task,
                evidence=args.evidence,
                requested_decision=args.requested_decision,
                post_to_pr=args.pr,
                dry_run=args.dry_run,
                reply_to=args.reply_to,
            )
        if args.command == "read":
            return cmd_read(
                runner=active_runner,
                paths=active_paths,
                config=config,
                request_id=args.request_id,
            )
        if args.command == "wait":
            return cmd_wait(
                runner=active_runner,
                paths=active_paths,
                config=config,
                timeout=args.timeout,
                interval=args.interval,
                request_id=args.request_id,
            )
        raise BridgeError("unknown command")
    except BridgeError as exc:
        print(redact_secrets(str(exc)), file=sys.stderr)
        return exc.code


if __name__ == "__main__":
    sys.exit(main())
