"""Private worker for the lifetime of one active Alina studio session."""

import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path.cwd()
token = os.environ.pop("MUSE_TRIAL_TOKEN")
lock = threading.Lock()
finished = threading.Condition(lock)
last_contact = time.monotonic()
model = None
phase = "warming"
job = {}
output = b""


def load_model():
    global model, phase
    try:
        subprocess.run(
            [sys.executable, "-u", str(ROOT / "setup.py")], cwd=ROOT, check=True
        )
        from infer import render

        with lock:
            model, phase = render, "ready"
    except Exception as error:
        print("Warm-up failed:", type(error).__name__, str(error)[:180], flush=True)
        with lock:
            phase = "failed"


def render_job(payload):
    global output
    started = time.monotonic()
    try:
        with (
            tempfile.TemporaryDirectory(dir=ROOT) as directory,
            zipfile.ZipFile(io.BytesIO(payload)) as archive,
        ):
            folder = Path(directory)
            for name, limit in (("face.png", 400_000), ("voice.wav", 2_900_000)):
                if archive.getinfo(name).file_size > limit:
                    raise ValueError("Input too large")
                (folder / name).write_bytes(archive.read(name))
            data, info = model(folder)
        info["inferenceSeconds"] = round(time.monotonic() - started, 3)
        with finished:
            output = data
            job.update(status="ready", info=info)
            finished.notify_all()
    except Exception as error:
        print("Render failed:", type(error).__name__, flush=True)
        with finished:
            job.update(status="failed")
            finished.notify_all()


def orphan_guard():
    # Runpod injects a Pod-scoped key. The studio's account credential stays local.
    while True:
        time.sleep(20)
        with lock:
            abandoned = time.monotonic() - last_contact > 180
        if abandoned:
            try:
                pod = os.environ["RUNPOD_POD_ID"]
                req = urllib.request.Request(
                    "https://api.runpod.io/v2/pods/" + pod,
                    method="DELETE",
                    headers={"Authorization": "Bearer " + os.environ["RUNPOD_API_KEY"]},
                )
                with urllib.request.urlopen(req, timeout=15):
                    return
            except (KeyError, OSError):
                continue


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, status, value, kind="application/json", info=None):
        data = json.dumps(value).encode() if kind == "application/json" else value
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        if info is not None:
            self.send_header("X-Alina-Clip", json.dumps(info, separators=(",", ":")))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        global last_contact
        if not hmac.compare_digest(
            self.headers.get("Authorization", ""), "Bearer " + token
        ):
            self.send(401, {})
            return False
        with lock:
            last_contact = time.monotonic()
        return True

    def send_result(self, key):
        with finished:
            finished.wait_for(lambda: job.get("id") != key or job["status"] != "running", timeout=18)
            if job.get("id") != key:
                response = (404, {})
            elif job["status"] == "ready":
                response = (200, output, "video/mp4", job["info"])
            else:
                response = (202, {"status": job["status"]})
        self.send(*response)

    def do_GET(self):
        if not self.authorized():
            return
        result = re.fullmatch(r"/jobs/([a-f0-9]{32})/result", self.path)
        if result:
            return self.send_result(result[1])
        with lock:
            if self.path == "/status":
                response = (200, {"status": phase})
            elif job and self.path == "/jobs/" + job["id"]:
                response = (200, {"status": job["status"], "info": job.get("info")})
            elif job and self.path == "/jobs/" + job["id"] + "/frames" and output:
                response = (200, output, "video/mp4")
            else:
                response = (404, {})
        self.send(*response)

    def do_POST(self):
        global job, output
        if not self.authorized():
            return
        match = re.fullmatch(r"/jobs/([a-f0-9]{32})", self.path)
        if not match:
            return self.send(404, {})
        length = int(self.headers.get("Content-Length", 0))
        if not 100 < length <= 3_200_000:
            return self.send(413, {})
        contents = self.rfile.read(length)
        digest = hashlib.sha256(contents).hexdigest()
        with lock:
            if job.get("id") == match[1]:
                ok = hmac.compare_digest(job["digest"], digest)
                result = (200 if ok else 409, {"status": job["status"]} if ok else {})
            elif phase != "ready" or job.get("status") == "running":
                result = (409, {"status": "busy"})
            else:
                job = dict(id=match[1], digest=digest, status="running")
                output = b""
                threading.Thread(
                    target=render_job, args=(contents,), daemon=True
                ).start()
                result = (202, {"status": "running"})
        if result[0] < 300 and self.headers.get("Accept") == "video/mp4":
            return self.send_result(match[1])
        self.send(*result)

    def do_DELETE(self):
        global job, output
        if not self.authorized():
            return
        with lock:
            if job and self.path == "/jobs/" + job["id"] and job["status"] != "running":
                job, output = {}, b""
                status = 200
            else:
                status = 404
        self.send(status, {})


threading.Thread(target=orphan_guard, daemon=True).start()
threading.Thread(target=load_model, daemon=True).start()
ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
