"""Composite MuseTalk into the fixed mouth and jaw of Alina's HD talk plate."""

from functools import lru_cache
from itertools import groupby
import json
import os
from pathlib import Path
import subprocess
import time
import wave

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageChops, ImageFilter

TAL = Path(__file__).resolve().parents[2] / "public/video/aida/presenter-v2/TAL"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FACE = (402, 186, 686, 550)
FACE_SIZE = (FACE[2] - FACE[0], FACE[3] - FACE[1])
MODEL_SIZE = 256
SHARPEN = ImageFilter.UnsharpMask(radius=0.9, percent=45, threshold=3)


@lru_cache(maxsize=1)
def anchor_face():
    """Read the fixed face once per studio process, at its native resolution."""
    x, y = FACE[:2]
    w, h = FACE_SIZE
    raw = subprocess.check_output(
        [
            FFMPEG,
            "-v",
            "error",
            "-i",
            str(TAL / "alina-a1-talbas.mp4"),
            "-vf",
            f"format=rgb24,crop={w}:{h}:{x}:{y}",
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ]
    )
    return Image.frombytes("RGB", FACE_SIZE, raw)


@lru_cache(maxsize=1)
def model_face():
    return anchor_face().resize((MODEL_SIZE, MODEL_SIZE), Image.Resampling.LANCZOS)


@lru_cache(maxsize=1)
def anchor_mask():
    with Image.open(TAL / "alina-a1-mun-kake.png") as source:
        return source.convert("L").crop(FACE)


def resized_region(frame, box, origin):
    """Sample a rectangle on exactly the same grid as the HD face."""
    x1, y1, x2, y2 = box
    sx = MODEL_SIZE / FACE_SIZE[0]
    sy = MODEL_SIZE / FACE_SIZE[1]
    return Image.fromarray(frame).resize(
        (x2 - x1, y2 - y1),
        Image.Resampling.LANCZOS,
        box=(
            x1 * sx - origin[0],
            y1 * sy - origin[1],
            x2 * sx - origin[0],
            y2 * sy - origin[1],
        ),
    )


@lru_cache(maxsize=1)
def fixed_layers():
    mask = anchor_mask()
    left, top, right, bottom = mask.getbbox()
    # Align to the 2x2 chroma grid of the final H.264 video.
    patch = (left & ~1, top & ~1, (right + 1) & ~1, (bottom + 1) & ~1)
    left, top, right, bottom = patch
    face = anchor_face()
    texture = np.asarray(face.crop(patch), dtype=np.float32) - np.asarray(
        face.filter(ImageFilter.GaussianBlur(2.2)).crop(patch), dtype=np.float32
    )
    ys, xs = np.mgrid[
        top + FACE[1] : bottom + FACE[1], left + FACE[0] : right + FACE[0]
    ]
    distance = np.sqrt(((xs - 538) / 66) ** 2 + ((ys - 437) / 48) ** 2)
    detail = (
        np.clip(texture, -8, 8)
        * (np.clip((distance - 1) / 0.45, 0, 1) * 0.65)[..., None]
    )
    # Keep a filter halo so sharpening at the edge matches the original full-face pass.
    padded = (
        max(0, left - 6),
        max(0, top - 6),
        min(FACE_SIZE[0], right + 6),
        min(FACE_SIZE[1], bottom + 6),
    )
    inner = (left - padded[0], top - padded[1], right - padded[0], bottom - padded[1])
    return patch, padded, inner, detail, mask.crop(patch)


def cheek_offset(faces, origin):
    # Only the two small skin samples take part in colour matching.
    box = (439 - FACE[0], 371 - FACE[1], 631 - FACE[0], 415 - FACE[1])
    cheeks = np.asarray(anchor_mask().crop(box)) < 51
    cheeks[:, 486 - 439 : 596 - 439] = False
    reference = np.asarray(anchor_face().crop(box), dtype=np.float32)[cheeks]
    offsets = [
        np.median(
            reference - np.asarray(resized_region(frame, box, origin))[cheeks], axis=0
        )
        for frame in faces[::12]
    ]
    return np.clip(np.median(offsets, axis=0), -12, 12)


def speech_weights(audio, count):
    with wave.open(str(audio), "rb") as stream:
        samples = (
            np.frombuffer(stream.readframes(stream.getnframes()), dtype="<i2").astype(
                float
            )
            / 32768
        )
    levels = [
        20 * np.log10(max(1e-9, np.mean(samples[n : n + 640] ** 2) ** 0.5))
        for n in range(0, len(samples), 640)
    ]
    weights = np.ones(count, dtype=np.float32)
    for quiet, indices in groupby(
        range(count), key=lambda i: i < len(levels) and levels[i] < -53
    ):
        span = list(indices)
        if not quiet or len(span) < 6:
            continue
        for i in span:
            release = max(0, 1 - (i - span[0]) / 3) if span[0] > 0 else 0
            anticipation = (
                max(0, 1 - (span[-1] + 1 - i) / 3) if span[-1] + 1 < len(levels) else 0
            )
            weight = max(release, anticipation)
            weights[i] = weight * weight * (3 - 2 * weight)
    indices = np.arange(count)
    return np.minimum(weights, np.minimum(indices / 2, (count - 1 - indices) / 4))


def compose_job(folder):
    folder = Path(folder)
    ready = json.loads((folder / "ready.json").read_text())
    count = ready["frames"]
    if not (1 <= count <= 2250 and ready["fps"] == 25):
        raise ValueError("Ogiltigt antal bildrutor eller bildfrekvens.")
    raw = subprocess.check_output(
        [
            FFMPEG,
            "-v",
            "error",
            "-i",
            str(folder / "faces.mp4"),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ]
    )
    source_crop = tuple(ready.get("sourceCrop", (0, 0, MODEL_SIZE, MODEL_SIZE)))
    if source_crop not in ((0, 0, MODEL_SIZE, MODEL_SIZE), (0, 112, 248, 144)):
        raise ValueError("Okänt utsnitt från MuseTalk.")
    origin = source_crop[:2]
    faces = np.frombuffer(raw, np.uint8).reshape(
        count, source_crop[3], source_crop[2], 3
    )
    patch, padded, inner, detail, mask = fixed_layers()
    # Pixel values are integers: floor(input + correction) == input + floor(correction).
    # Pillow applies these constant positive/negative maps in compiled integer code.
    correction = np.floor(detail + cheek_offset(faces, origin))
    plus = Image.fromarray(np.maximum(0, correction).astype("uint8"))
    minus = Image.fromarray(np.maximum(0, -correction).astype("uint8"))
    weights = speech_weights(folder / "voice.wav", count)
    mask_values = np.asarray(mask, dtype=np.float32) / 255
    alphas = {
        weight: Image.fromarray(
            np.rint(mask_values * np.float32(weight) * 255).astype(np.uint8)
        )
        for weight in np.unique(weights)
    }

    x, y = FACE[0] + patch[0], FACE[1] + patch[1]
    w, h = mask.size
    destination = folder / "talk.partial.mp4"
    cmd = [
        FFMPEG,
        "-y",
        "-v",
        "error",
        "-stream_loop",
        "-1",
        "-i",
        str(TAL / "alina-a1-talbas.mp4"),
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
        f"{w}x{h}",
        "-framerate",
        "25",
        "-i",
        "pipe:0",
        "-i",
        str(folder / "voice.wav"),
        "-filter_complex",
        f"[0:v]setpts=PTS-STARTPTS[base];[base][1:v]overlay=x={x}:y={y}:format=yuv420:shortest=1[v]",
        "-map",
        "[v]",
        "-map",
        "2:a:0",
        "-t",
        str(count / 25),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "15",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        str(destination),
    ]
    patch_seconds = 0.0
    with subprocess.Popen(cmd, stdin=subprocess.PIPE) as encoder:
        try:
            for frame, strength in zip(faces, weights, strict=True):
                begin = time.perf_counter()
                image = (
                    resized_region(frame, padded, origin).filter(SHARPEN).crop(inner)
                )
                rgb = ImageChops.subtract(ImageChops.add(image, plus), minus)
                rgb.putalpha(alphas[strength])
                pixels = rgb.tobytes()
                patch_seconds += time.perf_counter() - begin
                encoder.stdin.write(pixels)
        finally:
            encoder.stdin.close()
        if encoder.wait() != 0:
            raise RuntimeError("Kunde inte koda Alinas videoklipp.")
    destination.replace(folder / "talk.mp4")
    return {
        "frames": count,
        "patchWidth": w,
        "patchHeight": h,
        "patchSeconds": round(patch_seconds, 3),
    }


if __name__ == "__main__":
    print(json.dumps(compose_job(os.environ["ALINA_JOB_DIR"])))
