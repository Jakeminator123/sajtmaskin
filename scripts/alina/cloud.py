"""One shared MuseTalk GPU while local chat visitors are active."""

from collections import deque
from concurrent.futures import Future
import base64
import hashlib
import io
import json
import math
from pathlib import Path
import secrets
import threading
import time
import urllib.error
import urllib.request
import zipfile

from trial_api import api, create, recover, save_state, session_state

IDLE_SECONDS = 600
WORKER = Path(__file__).resolve().parent / "worker"


class RemotePod:
    def __init__(self, directory):
        directory.mkdir(exist_ok=True)
        self.path = directory / "service-state.json"
        self.name = "alina-musetalk-warm-" + secrets.token_hex(8)
        self.token = secrets.token_urlsafe(36)
        self.pod = None
        self.gpu = None

    def start(self):
        program = io.BytesIO()
        with zipfile.ZipFile(program, "w", zipfile.ZIP_DEFLATED) as archive:
            for filename in ("service.py", "infer.py", "setup.py", "weights.json"):
                archive.write(WORKER / filename, filename)
        boot = (
            "import os,io,base64,zipfile,runpy,sys; from pathlib import Path; "
            "p=Path('/tmp/alina-worker'); p.mkdir(exist_ok=True); os.chdir(p); sys.path.insert(0,str(p)); "
            "zipfile.ZipFile(io.BytesIO(base64.b64decode(os.environ.pop('MUSE_PROGRAM')))).extractall(p); "
            "runpy.run_path('service.py',run_name='__main__')"
        )
        state = session_state(self.name, self.path)
        record, gpu = create(
            self.name,
            {
                "entrypoint": ["/usr/bin/env", "python", "-u", "-c"],
                "cmd": [boot],
                "ports": ["8000/http"],
                "env": {
                    "MUSE_TRIAL_TOKEN": self.token,
                    "MUSE_PROGRAM": base64.b64encode(program.getvalue()).decode(),
                },
            },
        )
        self.pod = record["id"]
        state.update(
            pod=self.pod, gpu=gpu["id"], catalog_usd_per_hour=gpu["price"]["secure"]
        )
        save_state(self.path, state)
        deadline = time.monotonic() + 9 * 60
        next_check = 0
        previous = ""
        while time.monotonic() < deadline:
            if time.monotonic() >= next_check:
                if api("GET", "pods/" + self.pod)["status"] in (
                    "ERROR",
                    "FAILED",
                    "EXITED",
                    "TERMINATED",
                    "STOPPED",
                ):
                    raise RuntimeError("RunPod avslutade starten.")
                next_check = time.monotonic() + 15
            try:
                status = self.request("GET", "/status")["status"]
                note = "service " + status
            except (OSError, ValueError) as error:
                status = "warming"
                code = getattr(error, "code", None)
                note = "proxy " + str(code or type(error).__name__)
                if code == 401:
                    raise RuntimeError(
                        "Alinas worker avvisade sin sessionsnyckel."
                    ) from error
            if note != previous:
                print("Alina warm-up:", note, flush=True)
                previous = note
            if status == "ready":
                state["warmupSeconds"] = round(time.time() - state["started"], 3)
                save_state(self.path, state)
                return state["warmupSeconds"]
            if status == "failed":
                raise RuntimeError("MuseTalk kunde inte laddas.")
            time.sleep(1.5)
        raise TimeoutError("MuseTalk-uppvärmningen tog för lång tid.")

    def request(self, method, path, data=None, *, binary=False, wait_for_clip=False, retries=0):
        url = "https://" + self.pod + "-8000.proxy.runpod.net" + path
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": "Bearer " + self.token,
                "Content-Type": "application/zip",
                "Accept": "video/mp4" if binary or wait_for_clip else "application/json",
                "User-Agent": "Alina-MuseTalk-Trial/1.0",
            },
        )
        for attempt in range(retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=35) as response:
                    result = response.read(96 * 1024 * 1024 + 1)
                    info = response.headers.get("X-Alina-Clip") if wait_for_clip else None
                if len(result) > 96 * 1024 * 1024:
                    raise ValueError("Worker response is too large")
                if info is not None:
                    return {"status": "ready", "info": json.loads(info), "video": result}
                return result if binary else json.loads(result)
            except OSError:
                if attempt == retries:
                    raise
                time.sleep(1 + attempt)

    def render(self, folder):
        package = io.BytesIO()
        with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as archive:
            for name in ("face.png", "voice.wav"):
                archive.write(folder / name, name)
        path = "/jobs/" + folder.name
        deadline = time.monotonic() + 5 * 60
        status = self.request("POST", path, package.getvalue(), wait_for_clip=True, retries=2)
        while time.monotonic() < deadline:
            if status["status"] == "failed":
                raise RuntimeError("MuseTalk-renderingen misslyckades.")
            if status["status"] == "ready":
                info = status["info"]
                data = status["video"]
                if (
                    len(data) != info["bytes"]
                    or hashlib.sha256(data).hexdigest() != info["sha256"]
                ):
                    raise ValueError("Videons kontrollsumma stämmer inte.")
                (folder / "faces.mp4").write_bytes(data)
                (folder / "ready.json").write_text(json.dumps(info))
                self.gpu = info.get("gpu")
                self.request("DELETE", path)
                return info["inferenceSeconds"]
            status = self.request("GET", path + "/result", wait_for_clip=True, retries=2)
        raise TimeoutError("MuseTalk-renderingen tog för lång tid.")

    def close(self):
        if self.path.exists():
            recover(self.path)


class WarmWorker:
    def __init__(
        self, directory, reserve, *, idle_seconds=IDLE_SECONDS, factory=RemotePod
    ):
        self.directory, self.reserve = directory, reserve
        self.idle_seconds, self.factory = idle_seconds, factory
        self.condition = threading.Condition()
        self.queue = deque()
        self.until = self.paid_until = 0
        self.state = "sleeping"
        self.warmup_seconds = None
        self.inference_seconds = None
        self.gpu = None
        self.closing = False
        self.thread = threading.Thread(
            target=self._manage, name="Alina-MuseTalk", daemon=True
        )
        self.thread.start()

    def _extend(self, age=0):
        now = time.monotonic()
        end = now + self.idle_seconds - age
        if end > self.paid_until:
            start = max(now, self.paid_until)
            seconds = math.ceil((end - start) / 60) * 60
            self.reserve(seconds + (180 if self.paid_until <= now else 0))
            self.paid_until = start + seconds
        self.until = max(self.until, end)
        if self.state in ("sleeping", "failed"):
            self.state = "warming"
        self.condition.notify()

    def activity(self, idle_seconds=None, age=0):
        with self.condition:
            if self.closing:
                raise ValueError("Studion stängs av.")
            if idle_seconds is not None:
                self.idle_seconds = idle_seconds
            self._extend(age)
            return self.status()

    def status(self):
        with self.condition:
            return {
                "status": self.state,
                "idleSeconds": self.idle_seconds,
                "warmupSeconds": self.warmup_seconds,
                "inferenceSeconds": self.inference_seconds,
                "gpu": self.gpu,
            }

    def ensure_active(self, idle_seconds):
        with self.condition:
            if self.closing:
                raise RuntimeError("Studion stängs av.")
            warm = (
                self.state in ("ready", "rendering") and self.until > time.monotonic()
            )
            if self.until <= time.monotonic():
                self.idle_seconds = idle_seconds
                self._extend()
            return warm

    def render(self, folder):
        future = Future()
        with self.condition:
            if self.closing:
                raise RuntimeError("Studion stängs av.")
            if self.until <= time.monotonic():
                self._extend()
            self.queue.append((folder, future))
            self.condition.notify()
        return future.result(timeout=16 * 60)

    def _serve(self, remote):
        warmup = remote.start()
        heartbeat = time.monotonic() + 35
        while True:
            with self.condition:
                self.warmup_seconds = warmup
                self.state = "ready"
                if self.queue:
                    folder, future = self.queue.popleft()
                    self.state = "rendering"
                else:
                    remaining = self.until - time.monotonic()
                    if remaining <= 0 or self.closing:
                        return
                    if time.monotonic() < heartbeat:
                        self.condition.wait(
                            min(remaining, heartbeat - time.monotonic())
                        )
                        continue
                    future = None
            if future is None:
                remote.request("GET", "/status", retries=1)
            else:
                try:
                    seconds = remote.render(folder)
                    with self.condition:
                        self.inference_seconds = seconds
                        self.gpu = getattr(remote, "gpu", None)
                    future.set_result(seconds)
                except Exception as error:
                    future.set_exception(error)
                    raise
            heartbeat = time.monotonic() + 35

    def _manage(self):
        while True:
            with self.condition:
                self.condition.wait_for(
                    lambda: self.closing or self.queue or self.until > time.monotonic()
                )
                if self.closing and not self.queue:
                    return
                self.state = "warming"
                self.gpu = None
            remote = self.factory(self.directory)
            failed = False
            try:
                self._serve(remote)
            except Exception as error:
                print(
                    "Alina worker:",
                    type(error).__name__,
                    getattr(error, "code", ""),
                    flush=True,
                )
                with self.condition:
                    failed = True
                    self.until = 0
                    while self.queue:
                        self.queue.popleft()[1].set_exception(error)
            with self.condition:
                self.state = "cooling"
                self.paid_until = 0
            while True:
                try:
                    remote.close()
                    break
                except Exception as error:
                    print("Alina pod cleanup:", type(error).__name__, flush=True)
                    time.sleep(10)
            with self.condition:
                self.state = "failed" if failed else "sleeping"

    def close(self):
        with self.condition:
            self.closing = True
            self.until = 0
            self.condition.notify()
        self.thread.join(timeout=35)
