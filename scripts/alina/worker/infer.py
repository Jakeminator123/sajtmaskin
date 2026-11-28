"""MuseTalk loaded once on the GPU. Render one audio track at a time."""

import hashlib
import io
import json
import math
from functools import lru_cache
from pathlib import Path
import subprocess
import wave

import imageio_ffmpeg
import numpy as np
import torch
from diffusers import AutoencoderKL, UNet2DConditionModel
from PIL import Image
from transformers import WhisperFeatureExtractor, WhisperModel

MODELS = Path(__file__).resolve().parent / "weights"
FPS = 25
# Include the jaw, the cheek colour samples and the resampling halo on the 256px face.
CROP = (0, 112, 248, 144)
DEVICE = torch.device("cuda")
DTYPE = torch.float16
if not torch.cuda.is_available():
    raise RuntimeError("Expected a CUDA device")
gpu = torch.cuda.get_device_name()
whisper = (
    WhisperModel.from_pretrained(MODELS / "whisper", local_files_only=True)
    .encoder.eval()
    .to(DEVICE, DTYPE)
)
extractor = WhisperFeatureExtractor.from_pretrained(
    MODELS / "whisper", local_files_only=True
)
vae = (
    AutoencoderKL.from_pretrained(MODELS / "vae", local_files_only=True)
    .eval()
    .to(DEVICE)
)
unet = UNet2DConditionModel(**json.loads((MODELS / "unet/config.json").read_text()))
weights = torch.load(
    MODELS / "unet/unet.pth", map_location="cpu", weights_only=True, mmap=True
)
unet.load_state_dict(weights)
del weights
unet = unet.eval().to(DEVICE, DTYPE)
position = torch.arange(50, dtype=torch.float32)[:, None]
frequency = torch.exp(torch.arange(0, 384, 2) * (-math.log(10000.0) / 384))
encoding = torch.empty(50, 384)
encoding[:, 0::2] = torch.sin(position * frequency)
encoding[:, 1::2] = torch.cos(position * frequency)
encoding = encoding.to(DEVICE, DTYPE)
timestep = torch.tensor([0], device=DEVICE)
torch.cuda.synchronize()


@lru_cache(maxsize=1)
@torch.inference_mode()
def face_latents(png):
    torch.manual_seed(17)
    with Image.open(io.BytesIO(png)) as image:
        if image.size != (256, 256):
            raise ValueError("Expected the Alina face crop")
        face = np.asarray(image.convert("RGB"), dtype=np.float32) / 255
    reference = torch.from_numpy(face).permute(2, 0, 1).unsqueeze(0).to(DEVICE)
    masked = reference.clone()
    masked[:, :, 128:] = 0

    def encode(pixels):
        return (
            vae.encode(pixels * 2 - 1).latent_dist.sample() * vae.config.scaling_factor
        )

    return torch.cat([encode(masked), encode(reference)], dim=1).to(DTYPE)


@torch.inference_mode()
def render(folder):
    with wave.open(str(folder / "voice.wav"), "rb") as track:
        if (track.getframerate(), track.getnchannels(), track.getsampwidth()) != (
            16000,
            1,
            2,
        ):
            raise ValueError("Expected 16 kHz mono PCM")
        if not 0 < track.getnframes() <= 90 * 16000:
            raise ValueError("Audio duration is out of range")
        pcm = (
            np.frombuffer(track.readframes(track.getnframes()), dtype="<i2").astype(
                np.float32
            )
            / 32768
        )
    frames = math.ceil(len(pcm) * FPS / 16000)
    pcm = np.pad(pcm, (0, frames * (16000 // FPS) - len(pcm)))
    segments = []
    for start in range(0, len(pcm), 30 * 16000):
        features = extractor(
            pcm[start : start + 30 * 16000], sampling_rate=16000, return_tensors="pt"
        ).input_features.to(DEVICE, DTYPE)
        segments.append(
            torch.stack(
                whisper(features, output_hidden_states=True).hidden_states, dim=2
            )
        )
    encoded = torch.cat(segments, dim=1)[:, : frames * 2]
    # Five Whisper layers over ten features centered on each 25 fps frame.
    tail = encoded.shape[2:]
    padded = torch.cat(
        [encoded.new_zeros((1, 4, *tail)), encoded, encoded.new_zeros((1, 12, *tail))],
        dim=1,
    )
    windows = torch.cat(
        [padded[:, n * 2 : n * 2 + 10] for n in range(frames)], dim=0
    ).flatten(1, 2)
    latents = face_latents((folder / "face.png").read_bytes())
    x, y, width, height = CROP
    video = folder / "faces.mp4"
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(),
        "-y",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{width}x{height}",
        "-r",
        str(FPS),
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libx264rgb",
        "-crf",
        "10",
        "-preset",
        "fast",
        str(video),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for start in range(0, frames, 6):
            hints = windows[start : start + 6] + encoding
            prediction = unet(
                latents.expand(len(hints), -1, -1, -1),
                timestep,
                encoder_hidden_states=hints,
            ).sample
            rgb = (
                vae.decode(prediction.float() / vae.config.scaling_factor).sample / 2
                + 0.5
            ).clamp(0, 1)
            mouth = rgb[:, :, y : y + height, x : x + width]
            proc.stdin.write(
                (mouth.permute(0, 2, 3, 1) * 255).round().byte().cpu().numpy().tobytes()
            )
    finally:
        proc.stdin.close()
        code = proc.wait()
    if code:
        raise RuntimeError(f"Face video encoder exited {code}")
    data = video.read_bytes()
    return data, dict(
        frames=frames,
        sourceCrop=CROP,
        fps=FPS,
        sha256=hashlib.sha256(data).hexdigest(),
        bytes=len(data),
        gpu=gpu,
    )
