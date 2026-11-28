"""Alina studio, accessible on loopback or through the authenticated site bridge."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from functools import partial
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Condition
from urllib.parse import urlsplit
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import signal
import sqlite3
import shutil
import time
import urllib.request
import uuid

from cloud import WarmWorker
from compose import compose_job, model_face
from diagnostics import ProviderIssue, accounts, checked_key, classify, openai_probe, safe_result
from provider_config import provider_key
from trial_api import recover
from voice import recording

REPO = Path(__file__).resolve().parents[2]
PUBLIC = REPO / "public/video/aida/presenter-v2"
HOSTED = os.environ.get("ALINA_HOSTED") == "1"
CACHE = Path(os.environ["ALINA_DATA_DIR"]) if HOSTED else REPO / ".cache/alina-local"
DB = CACHE / "studio.sqlite3"
PORT = int(os.environ.get("PORT", "10000")) if HOSTED else 5814
SECRET_FILE = CACHE / "bridge-token"
HOSTED_TOKEN = os.environ.get("ALINA_BRIDGE_TOKEN", "") if HOSTED else ""
# Separate lifetime allowances are retained for local trials and older installations.
GPU_LIMIT = float(os.environ.get("ALINA_RUNPOD_LIMIT_USD", "0" if HOSTED else "30"))
VOICE_LIMIT = float(os.environ.get("ALINA_VOICE_LIMIT_USD", "0" if HOSTED else "30"))
PRIOR_GPU = 0 if HOSTED else 5.55
MONTHLY_POLICY = os.environ.get("ALINA_MONTHLY_STOP_USD", None if
    "ALINA_RUNPOD_LIMIT_USD" in os.environ or "ALINA_VOICE_LIMIT_USD" in os.environ else "200")
MONTHLY_LIMIT = None if MONTHLY_POLICY in (None, "off") else float(MONTHLY_POLICY)
VOICES = {
    "sanna": "aSLKtNoVBZlxQEMsnGL2",
    "eva": "HqmZnnvy6tCQd8EGWKRT",
    "vera": "QLfvbukvQvrPOx9HXQ3x",
}
DEFAULT = {
    "enabled": True,
    "scene": "kvall",
    "format": "wide",
    "blur": 2,
    "ambient": True,
    "entrance": True,
    "personal": True,
    "voice": "sanna",
    "method": "visemes",
    "tempo": 1.25,
    "chance": 50,
    "idleMinutes": 10,
    "weights": {"blink": 30, "glance": 28, "nod": 18, "hair": 16, "coffee": 8},
}
# Two speech segments can overlap TTS, GPU inference and local compositing.
# WarmWorker still submits one inference job at a time to the shared GPU.
POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="Alina-render")
job_changed = Condition()
SETTINGS_PATH = "/api/admin/alina"
FIRST_NAME = re.compile(r"[^\W\d_]+(?:[-’'][^\W\d_]+)*", re.UNICODE)
COOKIE_NAME = "alina_visit"
worker: WarmWorker


def db():
    connection = sqlite3.connect(DB, timeout=8)
    connection.row_factory = sqlite3.Row
    return connection


def read_settings(cx):
    row = cx.execute("SELECT value FROM settings WHERE id=1").fetchone()
    return {**DEFAULT, **(json.loads(row[0]) if row else {})}

def settings():
    with closing(db()) as cx:
        return read_settings(cx)


class ChatSpeechDisabled(ValueError):
    def __init__(self):
        super().__init__("Alinas chattuppläsning är avstängd.")


def valid_settings(data):
    if isinstance(data, dict) and "idleMinutes" not in data:
        data = {**data, "idleMinutes": DEFAULT["idleMinutes"]}
    if isinstance(data, dict) and "method" not in data:
        data = {**data, "method": DEFAULT["method"]}
    if not isinstance(data, dict) or data.keys() != DEFAULT.keys():
        raise ValueError("Inställningarna är ofullständiga.")
    for key, values in {
        "scene": ("atelje", "bibliotek", "kvall"),
        "format": ("wide", "square", "portrait"),
        "voice": tuple(VOICES),
        "method": ("musetalk", "visemes"),
    }.items():
        if data[key] not in values:
            raise ValueError("Okänt val.")
    for key in ("enabled", "entrance", "ambient", "personal"):
        if type(data[key]) is not bool:
            raise ValueError("Ogiltigt val.")
    if type(data["idleMinutes"]) is not int or not 1 <= data["idleMinutes"] <= 30:
        raise ValueError("Vilotiden ska vara mellan 1 och 30 minuter.")
    for key, lo, hi in (("blur", 0, 8), ("chance", 0, 100), ("tempo", 0.7, 1.25)):
        if type(data[key]) not in (int, float) or not lo <= data[key] <= hi:
            raise ValueError("Värde utanför intervallet.")
    if (
        not isinstance(data["weights"], dict)
        or data["weights"].keys() != DEFAULT["weights"].keys()
        or any(
            type(v) is not int or not 0 <= v <= 100 for v in data["weights"].values()
        )
    ):
        raise ValueError("Ogiltig fördelning av rörelser.")
    return data


def welcome(name, personal):
    name = name.strip().split()[:1] if isinstance(name, str) else []
    first = (
        name[0]
        if personal and name and FIRST_NAME.fullmatch(name[0]) and len(name[0]) <= 45
        else ""
    )
    return (
        f"Hej {first}! Jag heter Alina. Vad vill du skapa idag?"
        if first
        else "Hej! Jag heter Alina. Vad vill du skapa idag?"
    )


def completion_stream(result):
    """Frame a completed local test-model answer for OpenClaw's streaming client."""
    choices = result.get("choices") or []
    if not choices or not isinstance(choices[0].get("message"), dict):
        raise ValueError("Modellen saknar ett färdigt svar.")
    choice = choices[0]
    message = choice["message"]
    delta = {"role": "assistant", "content": message.get("content") or ""}
    if calls := message.get("tool_calls"):
        delta["tool_calls"] = [dict(call, index=i) for i, call in enumerate(calls)]
    header = {
        "id": result["id"],
        "object": "chat.completion.chunk",
        "model": result["model"],
        "created": result.get("created", int(time.time())),
    }
    events = (
        {"index": 0, "delta": delta, "finish_reason": None},
        {
            "index": 0,
            "delta": {},
            "finish_reason": choice.get("finish_reason") or "stop",
        },
    )
    return (
        b"".join(
            b"data: "
            + json.dumps({**header, "choices": [event]}, ensure_ascii=False).encode()
            + b"\n\n"
            for event in events
        )
        + b"data: [DONE]\n\n"
    )


class MonthlyBudgetReached(ValueError):
    def __init__(self):
        super().__init__("Alinas nödbroms för månaden har stoppat nya kostnader.")


def reserve_cost(cx, provider, amount):
    # Callers hold BEGIN IMMEDIATE until both the reservation and its job update commit.
    if MONTHLY_POLICY is not None or HOSTED:
        month = time.strftime("%Y-%m", time.gmtime())
        micros = round(amount * 1_000_000)
        row = cx.execute("SELECT micros FROM monthly_budget WHERE month=?", (month,)).fetchone()
        total = (row[0] if row else 0) + micros
        if MONTHLY_LIMIT is not None and total / 1_000_000 > MONTHLY_LIMIT:
            raise MonthlyBudgetReached()
        cx.execute("INSERT OR REPLACE INTO monthly_budget VALUES(?,?)", (month, total))
        if MONTHLY_POLICY is not None:
            return
    if provider == "voice":
        total = cx.execute("SELECT COALESCE(SUM(voice),0) FROM jobs").fetchone()[0]
        if total + amount + 0.25 > VOICE_LIMIT:
            raise ValueError("ElevenLabs-budgeten är full.")
    else:
        total = cx.execute("SELECT COALESCE(SUM(gpu),0) FROM jobs").fetchone()[0]
        if total + extra_reservations(cx) + PRIOR_GPU + amount > GPU_LIMIT:
            raise ValueError("RunPod-budgeten är full.")


def reserve_voice(job, amount):
    with closing(db()) as cx, cx:
        cx.execute("BEGIN IMMEDIATE")
        reserve_cost(cx, "voice", amount)
        cx.execute("UPDATE jobs SET voice=voice+? WHERE id=?", (amount, job))


def prepare_render(job, text, cfg, audio_key):
    folder = CACHE / job
    folder.mkdir(exist_ok=True)
    try:
        started = time.monotonic()
        method = cfg["method"]
        warm = worker.ensure_active(cfg["idleMinutes"] * 60) if method == "musetalk" else None
        wav, info, audio_cached = recording(
            CACHE, audio_key, text, VOICES[cfg["voice"]], cfg["tempo"],
            lambda: checked_key("ElevenLabs", "ELEVENLABS_API_KEY"),
            lambda: reserve_voice(job, max(0.02, len(text) * 0.01)),
        )
        try:
            os.link(wav, folder / "voice.wav")
        except OSError:
            shutil.copyfile(wav, folder / "voice.wav")
        after_voice = time.monotonic()
        timings = {
            "method": method, "warm": warm, "audioCached": audio_cached,
            "voiceSeconds": round(after_voice - started, 3), "onset": info["onset"],
        }
        if method == "visemes":
            timings["cues"] = info["cues"]
        else:
            model_face().save(folder / "face.png")
            inference = worker.render(folder)
            after_gpu = time.monotonic()
            composite = compose_job(folder)
            (folder / "render.log").write_text(json.dumps(composite))
            timings.update(
                inferenceSeconds=inference, gpuSeconds=round(after_gpu - after_voice, 3),
                composeSeconds=round(time.monotonic() - after_gpu, 3),
                patchSeconds=composite["patchSeconds"],
                gpu=json.loads((folder / "ready.json").read_text()).get("gpu"),
            )
        timings["totalSeconds"] = round(time.monotonic() - started, 3)
        (folder / "timings.json").write_text(json.dumps(timings))
        status = "ready"
    except MonthlyBudgetReached:
        status = "budget_stopped"
    except ProviderIssue as error:
        (folder / "provider-error.txt").write_text(str(error), encoding="utf-8")
        status = "failed"
    except Exception as error:
        print("Alina job", job, "failed", type(error).__name__, flush=True)
        status = "failed"
    with closing(db()) as cx, cx:
        cx.execute("UPDATE jobs SET status=? WHERE id=?", (status, job))
    with job_changed:
        job_changed.notify_all()
    print("Alina job", job, status, flush=True)


def submit(owner, text, cfg, public_greeting=False, *, audition=False):
    if not text or len(text) > 450:
        raise ValueError("Repliken får innehålla 1–450 tecken.")
    # Only the fixed anonymous welcome is shared. All other audio and video are isolated per visitor.
    if public_greeting:
        owner = "generic-welcome"
    audio_key = hashlib.sha256(
        json.dumps([owner, text, cfg["voice"], cfg["tempo"]]).encode()
    ).hexdigest()
    method = cfg["method"]
    digest = hashlib.sha256(f"timeline-v1/{audio_key}/{method}".encode()).hexdigest()
    filename = "voice.wav" if method == "visemes" else "talk.mp4"
    gpu_reserve = 0.36 if method == "musetalk" else 0
    with closing(db()) as cx, cx:
        cx.execute("BEGIN IMMEDIATE")
        if not audition and not read_settings(cx)["enabled"]:
            raise ChatSpeechDisabled()
        row = cx.execute(
            "SELECT id,status FROM jobs WHERE digest=? AND status IN ('pending','ready') ORDER BY created DESC LIMIT 1",
            (digest,),
        ).fetchone()
        if row and (
            row["status"] == "pending" or (CACHE / row["id"] / filename).is_file()
        ):
            return {**dict(row), "videoCached": row["status"] == "ready"}
        if (
            cx.execute("SELECT count(*) FROM jobs WHERE status='pending'").fetchone()[0]
            >= 5
        ):
            raise ValueError("Kön är full. Försök igen om en stund.")
        if gpu_reserve:
            reserve_cost(cx, "gpu", gpu_reserve)
        job = uuid.uuid4().hex
        cx.execute(
            "INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)",
            (
                job,
                digest,
                owner,
                "pending",
                gpu_reserve,
                0,
                time.time(),
                None,
            ),
        )
    POOL.submit(prepare_render, job, text, cfg, audio_key)
    return {"id": job, "status": "pending"}


def initialize():
    global worker
    if not all(math.isfinite(n) and n >= 0 for n in (GPU_LIMIT, VOICE_LIMIT)):
        raise RuntimeError("Ogiltig provbudget för Alina.")
    if MONTHLY_LIMIT is not None and (not math.isfinite(MONTHLY_LIMIT) or MONTHLY_LIMIT < 0):
        raise RuntimeError("Ogiltig månadsgräns för Alina.")
    if HOSTED:
        if (not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", HOSTED_TOKEN)
                or not CACHE.is_absolute()):
            raise RuntimeError("Kontrollera bryggnyckel och datadisk för Alina.")
    CACHE.mkdir(parents=True, exist_ok=True)
    if not HOSTED and not SECRET_FILE.exists():
        with SECRET_FILE.open("x") as f:
            f.write(secrets.token_urlsafe(40))
    with closing(db()) as cx, cx:
        cx.execute("BEGIN IMMEDIATE")
        cx.execute("CREATE TABLE IF NOT EXISTS text_budget(reserved REAL NOT NULL)")
        cx.execute(
            "CREATE TABLE IF NOT EXISTS gpu_extras(id TEXT PRIMARY KEY,reserved REAL NOT NULL)"
        )
        cx.execute(
            "CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)"
        )
        cx.execute(
            "CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,digest TEXT,owner TEXT,status TEXT,gpu REAL,voice REAL,created REAL,spoken TEXT)"
        )
        cx.execute("UPDATE jobs SET status='failed' WHERE status='pending'")
        if HOSTED or MONTHLY_POLICY is not None:
            migrate_monthly_budget(cx)
    # Reconcile only this studio's interrupted GPU jobs before accepting new requests.
    for state_path in CACHE.glob("*/service-state.json"):
        recover(state_path)
    worker = WarmWorker(
        CACHE / "warm-worker",
        reserve_warm_time,
        idle_seconds=settings()["idleMinutes"] * 60,
    )


def extra_reservations(cx):
    return cx.execute(
        "SELECT (SELECT COALESCE(SUM(reserved),0) FROM text_budget) + "
        "(SELECT COALESCE(SUM(reserved),0) FROM gpu_extras)"
    ).fetchone()[0]


def migrate_monthly_budget(cx):
    if cx.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='monthly_budget'").fetchone():
        return
    cx.execute("CREATE TABLE monthly_budget(month TEXT PRIMARY KEY, micros INTEGER NOT NULL)")
    cx.execute("""
        INSERT INTO monthly_budget
        SELECT strftime('%Y-%m',created,'unixepoch'), CAST(ROUND(SUM(COALESCE(gpu,0)+COALESCE(voice,0))*1000000) AS INTEGER)
        FROM jobs WHERE created IS NOT NULL GROUP BY 1
    """)
    # Older warm-time reservations have no date. Carry them into the first month once.
    cx.execute("""
        INSERT INTO monthly_budget VALUES(strftime('%Y-%m','now'),?)
        ON CONFLICT(month) DO UPDATE SET micros=micros+excluded.micros
    """, (round((extra_reservations(cx) + (0 if HOSTED else PRIOR_GPU)) * 1_000_000),))


def budget_summary():
    if MONTHLY_POLICY is None:
        return "Separata provbudgetar för RunPod och ElevenLabs är aktiva."
    month = time.strftime("%Y-%m", time.gmtime())
    with closing(db()) as cx:
        row = cx.execute("SELECT micros FROM monthly_budget WHERE month=?", (month,)).fetchone()
    amount = (row[0] if row else 0) / 1_000_000
    limit = f"Nödbroms {MONTHLY_LIMIT:g} USD." if MONTHLY_LIMIT is not None else "Nödbroms av."
    return f"{amount:.2f} USD reserverat i denna studio under {month} (UTC). {limit}"


def reserve_warm_time(seconds):
    # Catalog placement caps the GPU at $0.90/h. Include space for disk and termination.
    amount = seconds / 3600
    with closing(db()) as cx, cx:
        cx.execute("BEGIN IMMEDIATE")
        reserve_cost(cx, "gpu", amount)
        cx.execute(
            "INSERT INTO gpu_extras VALUES('warm-runtime',?) ON CONFLICT(id) "
            "DO UPDATE SET reserved=reserved+excluded.reserved",
            (amount,),
        )


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def host_ok(self):
        if HOSTED:
            return self.bridge()
        return self.headers.get("Host") in {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}

    def bridge(self):
        expected = HOSTED_TOKEN if HOSTED else SECRET_FILE.read_text().strip()
        return hmac.compare_digest(
            self.headers.get("X-Alina-Bridge", "").encode(), expected.encode()
        ) and bool(expected)

    def write_allowed(self):
        return self.host_ok() and (
            self.bridge()
            or self.headers.get("Origin") == f"http://{self.headers.get('Host')}"
        )

    def owner(self):
        if self.bridge():
            asserted = self.headers.get("X-Alina-Owner", "")
            if asserted and len(asserted) < 160:
                return asserted
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            pass
        value = cookie[COOKIE_NAME].value if COOKIE_NAME in cookie else ""
        if not re.fullmatch("[0-9a-f]{48}", value):
            value = secrets.token_hex(24)
            self.new_cookie = value
        return "visit-" + value

    def send_json(self, status, data):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "private, no-store")
        if cookie := getattr(self, "new_cookie", None):
            self.send_header(
                "Set-Cookie",
                f"{COOKIE_NAME}={cookie}; Path=/; SameSite=Strict; HttpOnly",
            )
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def do_POST(self):
        if self.path == "/internal/model/v1/chat/completions":
            if HOSTED:
                return self.send_json(404, {})
            return self.model_completion()
        if not self.write_allowed():
            return self.send_json(403, {"error": "Åtkomst nekad."})
        size = int(self.headers.get("Content-Length", 0))
        if not 0 < size <= 6000:
            return self.send_json(413, {"error": "Ogiltig storlek."})
        try:
            body = json.loads(self.rfile.read(size))
            if self.path == "/api/alina/diagnostics":
                if body == {"check": "openai"}:
                    return self.send_json(200, {"OpenAI": safe_result(openai_probe)})
                if body == {"check": "accounts"}:
                    return self.send_json(200, {**accounts(HOSTED), "Budget": budget_summary()})
                return self.send_json(400, {"error": "Okänd driftkontroll."})
            if self.path == "/api/alina/activity":
                cfg = settings()
                if not cfg["enabled"]:
                    return self.send_json(409, {"error": "Alina är avstängd."})
                if cfg["method"] == "visemes" or body.get("method") == "visemes":
                    return self.send_json(200, worker.status())
                age = body.get("idleForMs", 0)
                if type(age) is not int or not 0 <= age <= 15000:
                    raise ValueError("Ogiltig aktivitetstid.")
                return self.send_json(
                    200, worker.activity(cfg["idleMinutes"] * 60, age / 1000)
                )
            if self.path == SETTINGS_PATH:
                cfg = valid_settings(body)
                with closing(db()) as cx, cx:
                    cx.execute(
                        "INSERT OR REPLACE INTO settings VALUES(1,?)",
                        (json.dumps(cfg),),
                    )
                return self.send_json(200, cfg)
            if self.path not in ("/api/alina/speech", "/api/alina/audition"):
                return self.send_json(404, {})
            cfg = settings()
            if self.path == "/api/alina/speech" and not cfg["enabled"]:
                raise ChatSpeechDisabled()
            if "voice" in body or "tempo" in body:
                cfg = valid_settings({**cfg, "voice": body.get("voice"), "tempo": body.get("tempo")})
            if "method" in body:
                if body["method"] not in ("visemes", "musetalk"):
                    raise ValueError("Okänd läppsynk.")
                cfg["method"] = body["method"]
            kind = body.get("kind")
            if kind == "welcome":
                name = body.get("name") if self.bridge() else body.get("testName")
                speech = welcome(name, cfg["personal"])
                generic = speech == welcome("", False)
            elif kind == "reply" and isinstance(body.get("text"), str):
                speech = body["text"].strip()
                generic = False
            else:
                raise ValueError("Okänd replik.")
            owner = self.owner()
            demo = {
                "Hej! Jag heter Alina. Vad vill du skapa idag?": "valkommen",
                "Hej Jakob! Jag heter Alina. Vad vill du skapa idag?": "valkommen-jakob",
            }.get(speech)
            if (
                kind == "welcome" and cfg["method"] == "musetalk"
                and cfg["voice"] == "sanna"
                and cfg["tempo"] == 1.25
                and demo
                and (PUBLIC / "TAL" / (demo + ".mp4")).is_file()
            ):
                return self.send_json(
                    200,
                    {
                        "status": "ready",
                        "text": speech,
                        "url": "../TAL/" + demo + ".mp4",
                    },
                )
            job = submit(owner, speech, cfg, generic, audition=self.path == "/api/alina/audition")
            self.send_json(200, {**job, "text": speech})
        except ChatSpeechDisabled as error:
            self.send_json(409, {"error": str(error)})
        except (ValueError, TypeError, AttributeError) as e:
            self.send_json(400, {"error": str(e)})

    def model_completion(self):
        # The isolated local OpenClaw sends its prompts here. Only this process holds the RunPod key.
        token_file = CACHE / "model-token"
        if (
            not self.host_ok()
            or not token_file.is_file()
            or not hmac.compare_digest(
                self.headers.get("Authorization", ""),
                "Bearer " + token_file.read_text().strip(),
            )
        ):
            return self.send_json(403, {"error": "Åtkomst nekad."})
        length = int(self.headers.get("Content-Length", 0))
        if not 0 < length <= 120000:
            return self.send_json(413, {"error": "För lång konversation."})
        try:
            body = json.loads(self.rfile.read(length))
            wants_stream = body.get("stream") is True
            body["stream"] = wants_stream
            body.pop("stream_options", None)
            if body.get("model") == "glm-5.3":
                endpoint = "b1dd8hy2hqo1nb"
                body["reasoning_effort"] = "low"
            else:
                endpoint = "qwen3-32b-awq"
                body["model"] = "Qwen/Qwen3-32B-AWQ"
                body["chat_template_kwargs"] = {"enable_thinking": False}
            body.pop("max_completion_tokens", None)
            body["max_tokens"] = 1200
            with closing(db()) as cx, cx:
                cx.execute("BEGIN IMMEDIATE")
                # 120k input bytes and 1,200 output tokens fit within this conservative per-call reserve.
                try:
                    reserve_cost(cx, "gpu", 0.15)
                except ValueError as error:
                    return self.send_json(429, {"error": str(error)})
                cx.execute("INSERT INTO text_budget VALUES(0.15)")
            request = urllib.request.Request(
                f"https://api.runpod.ai/v2/{endpoint}/openai/v1/chat/completions",
                data=json.dumps(body).encode(),
                headers={
                    "Authorization": "Bearer " + provider_key("RUNPOD_API_KEY"),
                    "Content-Type": "application/json",
                },
            )
            started = time.monotonic()
            with urllib.request.urlopen(request, timeout=90) as upstream:
                if wants_stream and upstream.headers.get_content_type() == "text/event-stream":
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    first = None
                    for line in upstream:
                        self.wfile.write(line)
                        self.wfile.flush()
                        if first is None and line.startswith(b"data:") and line[5:].strip() != b"[DONE]":
                            try:
                                packet = json.loads(line[5:])
                            except ValueError:
                                continue
                            choices = packet.get("choices") or []
                            delta = choices[0].get("delta", {}) if choices else {}
                            if delta.get("content") or delta.get("tool_calls"):
                                first = round(time.monotonic() - started, 3)
                    print("Alina model", endpoint, "firstTokenSeconds", first,
                          "completeSeconds", round(time.monotonic() - started, 3), flush=True)
                    return
                result = json.load(upstream)
            if not wants_stream:
                return self.send_json(200, result)
            raw = completion_stream(result)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        except urllib.error.HTTPError as error:
            with error:
                issue = classify("RunPod", error.code, error.read(8192).decode(errors="replace"))
                return self.send_json(error.code, {"error": {"message": str(issue)}})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        except (KeyError, ValueError, OSError):
            self.send_json(
                502, {"error": "RunPods lokala modellanslutning misslyckades."}
            )

    def do_HEAD(self):
        if HOSTED:
            return self.do_GET()
        if not self.host_ok():
            return self.send_json(403, {})
        route = urlsplit(self.path).path
        if route.startswith("/api/alina/media/") or route.lower().endswith(".mp4"):
            return self.do_GET()
        return super().do_HEAD()

    def do_GET(self):
        if HOSTED and self.path == "/healthz":
            return self.send_json(200, {"ready": True})
        if not self.host_ok():
            return self.send_json(403, {})
        route = urlsplit(self.path).path
        if route == "/api/alina/runtime":
            return self.send_json(200, {**worker.status(), "budget": budget_summary()})
        if route == "/api/alina/config":
            self.owner()
            return self.send_json(200, settings())
        if route == SETTINGS_PATH:
            return self.send_json(200, settings())
        m = re.fullmatch(r"/api/alina/(jobs|media)/([a-f0-9]{32})", route)
        if m:
            with closing(db()) as cx:
                def read_job():
                    return cx.execute("SELECT owner,status FROM jobs WHERE id=?", (m[2],)).fetchone()

                row = read_job()
                if not row or row["owner"] not in (self.owner(), "generic-welcome"):
                    return self.send_json(404, {})
                if m[1] == "jobs" and row["status"] == "pending" and urlsplit(self.path).query == "wait=1":
                    with job_changed:
                        job_changed.wait_for(lambda: read_job()["status"] != "pending", timeout=8)
                    row = read_job()
            if m[1] == "jobs":
                if row["status"] == "budget_stopped":
                    return self.send_json(200, {"status": "failed", "error": str(MonthlyBudgetReached())})
                failure = CACHE / m[2] / "provider-error.txt"
                if row["status"] == "failed" and failure.is_file():
                    return self.send_json(200, {"status": "failed", "error": failure.read_text(encoding="utf-8")})
                metrics = CACHE / m[2] / "timings.json"
                timings = (
                    json.loads(metrics.read_text())
                    if row["status"] == "ready" and metrics.is_file()
                    else None
                )
                return self.send_json(
                    200, {"status": row["status"], "timings": timings}
                )
            if row["status"] != "ready":
                return self.send_json(404, {})
            directory = CACHE / m[2]
            video = directory / "talk.mp4"
            if video.is_file():
                return self.send_movie(video)
            metrics = directory / "timings.json"
            if metrics.is_file() and json.loads(metrics.read_text()).get("method") == "visemes":
                return self.send_movie(directory / "voice.wav")
            return self.send_json(404, {})
        if HOSTED:
            return self.send_json(404, {})
        if route in ("/", "/alina", "/admin", "/backoffice", "/backoffic"):
            self.send_response(302)
            self.send_header(
                "Location",
                "/SCEN/index.html"
                + (
                    "?edit=1"
                    if route in ("/admin", "/backoffice", "/backoffic")
                    else ""
                ),
            )
            self.end_headers()
            return
        if route.lower().endswith(".mp4"):
            asset = Path(self.translate_path(route)).resolve()
            if not asset.is_relative_to(PUBLIC):
                return self.send_json(404, {})
            return self.send_movie(asset, public_asset=True)
        return super().do_GET()

    def send_movie(self, path, *, public_asset=False):
        if not path.is_file():
            return self.send_json(404, {})
        size = path.stat().st_size
        start, end = 0, size - 1
        requested = self.headers.get("Range")
        if requested:
            match = re.fullmatch(r"bytes=(\d{0,20})-(\d{0,20})", requested)
            if match and any(match.groups()):
                first, last = match.groups()
                start = int(first) if first else max(0, size - int(last))
                end = min(end, int(last)) if first and last else end
            else:
                start = size
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        self.send_response(206 if requested else 200)
        self.send_header("Content-Type", "audio/wav" if path.suffix == ".wav" else "video/mp4")
        self.send_header("Cache-Control", "no-cache" if public_asset else "private, no-store")
        if public_asset:
            self.send_header("Last-Modified", self.date_time_string(path.stat().st_mtime))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if requested:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if self.command == "HEAD":
            return
        with path.open("rb") as stream:
            stream.seek(start)
            remaining = end - start + 1
            try:
                while remaining and (block := stream.read(min(remaining, 256 * 1024))):
                    self.wfile.write(block)
                    remaining -= len(block)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass


if __name__ == "__main__":
    os.chdir(REPO)
    httpd = ThreadingHTTPServer(
        ("0.0.0.0" if HOSTED else "127.0.0.1", PORT), partial(Handler, directory=str(PUBLIC))
    )
    initialize()
    if HOSTED:
        def terminate(_signum, _frame):
            raise KeyboardInterrupt
        signal.signal(signal.SIGTERM, terminate)
    print(f"Alina {'hosted' if HOSTED else 'local'} port {PORT}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        worker.close()
        httpd.server_close()
