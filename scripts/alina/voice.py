"""One visitor-scoped recording and timeline for both lip-sync methods."""

import base64
import json
import math
import subprocess
import urllib.request
import wave
from threading import Lock

import imageio_ffmpeg
import numpy as np
from diagnostics import read_json


# Requests for the same recording share synthesis, even when both renderers start together.
_locks = [Lock() for _ in range(64)]


def timeline(alignment, tempo, wav):
    letters = alignment["characters"]
    starts = alignment["character_start_times_seconds"]
    ends = alignment["character_end_times_seconds"]
    with wave.open(str(wav), "rb") as audio:
        rate = audio.getframerate()
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2")
    if not len(samples) or not letters or not len(letters) == len(starts) == len(ends):
        raise ValueError("Tidskoder eller ljud saknas.")
    # Require a sustained syllable-level signal, ignoring codec noise before the first word.
    window = max(1, rate // 100)
    padded = np.pad(samples.astype(np.float32), (0, -len(samples) % window))
    rms = np.sqrt(np.mean(padded.reshape(-1, window) ** 2, axis=1))
    above = rms > max(65, float(rms.max()) * 0.016)
    audible = np.flatnonzero(above[:-1] & above[1:])
    onset = round(float(audible[0]) * window / rate, 4) if len(audible) else None
    duration = len(samples) / rate
    cues = []
    last_end = 0
    for letter, start, end in zip(letters, starts, ends, strict=True):
        if not all(math.isfinite(t) for t in (start, end)) or start < 0 or end < start:
            raise ValueError("Ogiltiga tidskoder från rösttjänsten.")
        start = min(duration, max(last_end, start / tempo))
        end = min(duration, max(start, end / tempo))
        last_end = end
        char = letter.casefold()
        if char in ("a", "ä"):
            shape = "open"
        elif char in ("o", "u", "å", "ö", "y"):
            shape = "round"
        elif char in ("i", "e", "j"):
            shape = "wide"
        elif char in ("f", "v"):
            shape = "teeth"
        elif char in ("m", "b", "p") or not char.isalpha():
            shape = "rest"
        else:
            shape = "mid"
        if end > start:
            cues.append([round(start, 4), round(end, 4), shape])
    return {"cues": cues, "onset": onset, "duration": duration}


def recording(directory, key, text, voice_id, tempo, api_key, reserve):
    folder = directory / "recordings" / key
    with _locks[int(key[:2], 16) % len(_locks)]:
        wav = folder / "voice.wav"
        meta = folder / "timeline.json"
        if wav.is_file() and meta.is_file():
            return wav, json.loads(meta.read_text()), True
        folder.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128",
            data=json.dumps({
                "text": text, "model_id": "eleven_multilingual_v2", "language_code": "sv",
                "voice_settings": {"stability": 0.48, "similarity_boost": 0.78},
            }).encode(),
            headers={"xi-api-key": api_key(), "Content-Type": "application/json"},
        )
        reserve()
        result = read_json("ElevenLabs", request, timeout=70)
        audio = base64.b64decode(result["audio_base64"], validate=True)
        subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-v", "error", "-i", "pipe:0",
            "-af", f"atempo={tempo}", "-ar", "16000", "-ac", "1", str(wav),
        ], input=audio, check=True)
        info = timeline(result.get("normalized_alignment") or result["alignment"], tempo, wav)
        temp = folder / "timeline.tmp"
        temp.write_text(json.dumps(info))
        temp.replace(meta)
        return wav, info, False
