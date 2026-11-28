import json
import time
import urllib.error
import urllib.request
from functools import lru_cache
from diagnostics import ProviderIssue, checked_key, classify

HOST = "https://api.runpod.io/v2/"
IMAGE = "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04"


@lru_cache(maxsize=1)
def account_key():
    return checked_key("RunPod", "RUNPOD_API_KEY")


class ApiError(ProviderIssue):
    def __init__(self, code, detail):
        self.code = code
        detail_lower = detail.lower()
        self.try_next_gpu = (code == 400 or code == 403 and any(
            word in detail_lower for word in ("capacity", "unavailable", "no longer available")
        )) and not any(word in detail_lower for word in ("credit", "funds", "balance", "payment"))
        super().__init__("RunPod", classify("RunPod", code, detail).reason)


def api(method, path, body=None):
    payload = (
        json.dumps(body, separators=(",", ":")).encode() if body is not None else None
    )
    req = urllib.request.Request(
        HOST + path,
        data=payload,
        method=method,
        headers={
            "Authorization": "Bearer " + account_key(),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=50) as response:
            data = response.read()
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as err:
        raw = err.read().decode(errors="replace")
        try:
            detail = str(json.loads(raw))[:4096]
        except Exception:
            detail = "invalid response"
        raise ApiError(err.code, detail) from None


def save_state(path, state):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state))
    temporary.replace(path)


def session_state(name, path):
    if path.exists():
        prior = json.loads(path.read_text())
        if not prior.get("terminated"):
            raise RuntimeError("An Alina trial is still active")
    state = {"name": name, "started": time.time()}
    save_state(path, state)
    return state


def create(name, config):
    catalog = api("GET", "catalog/gpus?include=AVAILABILITY&product=POD")["gpus"]
    allowed = {
        "NVIDIA RTX A4000",
        "NVIDIA RTX A4500",
        "NVIDIA RTX A5000",
        "NVIDIA RTX 4000 Ada Generation",
        "NVIDIA RTX 2000 Ada Generation",
        "NVIDIA RTX 4500 Ada Generation",
        "NVIDIA A40",
        "NVIDIA L4",
        "NVIDIA GeForce RTX 3090",
        "NVIDIA GeForce RTX 4090",
        "NVIDIA RTX A6000",
    }
    for gpu in sorted(
        [
            g
            for g in catalog
            if g["id"] in allowed
            and g.get("availability") != "NONE"
            and (g.get("price", {}).get("secure") or 5) <= 0.9
        ],
        key=lambda g: (g["id"] != "NVIDIA GeForce RTX 4090", g["price"]["secure"]),
    ):
        body = {
            "name": name,
            "image": IMAGE,
            "disk": 30,
            "gpu": {
                "id": gpu["id"],
                "count": 1,
                "minCudaVersion": "12.4",
                "minRamPerGpu": 20,
            },
            "cloud": "SECURE",
            "startJupyter": False,
            "startSsh": False,
            **config,
        }
        try:
            return api("POST", "pods", body), gpu
        except ApiError as err:
            if err.try_next_gpu:
                print("Placement", gpu["id"], str(err)[:140], flush=True)
                continue
            raise
        except (TimeoutError, OSError):
            time.sleep(4)
            matches = [p for p in api("GET", "pods")["pods"] if p["name"] == name]
            if len(matches) == 1:
                return matches[0], gpu
            raise
    raise ProviderIssue("RunPod", "Ingen godkänd GPU var tillgänglig till studions timpris.")


def finish(pod, name, state, path):
    for attempt in range(4):
        try:
            try:
                current = api("GET", "pods/" + pod)
                if current.get("name") != name:
                    raise RuntimeError("Trial pod ownership mismatch")
                if current.get("status") != "TERMINATED":
                    api("DELETE", "pods/" + pod)
            except ApiError as e:
                if e.code != 404:
                    raise
            try:
                if api("GET", "pods/" + pod).get("status") != "TERMINATED":
                    time.sleep(3)
                    continue
            except ApiError as e:
                if e.code != 404:
                    raise
            state.update(terminated=True, ended=time.time())
            save_state(path, state)
            print("RunPod confirmed the trial pod is terminated.", flush=True)
            return
        except (ApiError, urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(3)
    raise RuntimeError("Termination not yet confirmed")


def recover(path):
    state = json.loads(path.read_text())
    if state.get("terminated"):
        return
    name = state["name"]
    if not name.startswith(("alina-musetalk-trial-", "alina-musetalk-warm-")):
        raise RuntimeError("Unrecognized Alina pod record")
    pod = state.get("pod")
    if not pod:
        matches = [row for row in api("GET", "pods")["pods"] if row.get("name") == name]
        if len(matches) > 1:
            raise RuntimeError("Ambiguous Alina pod record")
        if not matches:
            state.update(terminated=True, ended=time.time())
            save_state(path, state)
            return
        pod = matches[0]["id"]
        state["pod"] = pod
    finish(pod, name, state, path)
