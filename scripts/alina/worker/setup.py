import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent


def fetch(entry):
    dest = ROOT / "weights" / entry["filename"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(3):
        try:
            digest = hashlib.sha256()
            url = entry["url"] + "?download=true&alina=" + str(int(time.time()))
            with (
                urllib.request.urlopen(url, timeout=90) as source,
                partial.open("wb") as output,
            ):
                while block := source.read(4 * 1024 * 1024):
                    output.write(block)
                    digest.update(block)
            if partial.stat().st_size != entry["size"] or (
                entry["sha256"] and digest.hexdigest() != entry["sha256"]
            ):
                raise ValueError("checkpoint verification failed")
            partial.replace(dest)
            print("Ready:", entry["filename"], flush=True)
            return
        except Exception as err:
            if attempt == 2:
                raise RuntimeError(
                    f"Download {entry['filename']}: {type(err).__name__} {err}"
                ) from None
            time.sleep(2 + attempt * 3)


def dependencies():
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--retries",
            "2",
            "--timeout",
            "35",
            "diffusers==0.30.2",
            "transformers==4.39.2",
            "huggingface-hub==0.30.2",
            "accelerate==0.28.0",
            "imageio-ffmpeg==0.6.0",
            "numpy<2",
        ],
        check=True,
        stdout=(ROOT / "pip.log").open("w"),
        stderr=subprocess.STDOUT,
    )
    print("Python dependencies installed", flush=True)


with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    deps = pool.submit(dependencies)
    jobs = [
        pool.submit(fetch, e) for e in json.loads((ROOT / "weights.json").read_text())
    ]
    for job in jobs:
        job.result()
    deps.result()
print("Dependencies and model checkpoints are ready.", flush=True)
