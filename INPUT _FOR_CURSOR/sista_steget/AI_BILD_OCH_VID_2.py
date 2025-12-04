#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Litet GUI för text->bild (gpt-image-1) och text/bild->video (Sora 2).

- Sparar filer i den mapp där skriptet körs (current working directory).
- Panel där du kan välja:
    * Bild eller video
    * Upplösning
    * Kvalitet (bild)
    * Videolängd (sekunder)
    * Valfri referensbild som automatiskt anpassas till rätt storlek
      och skickas till Sora.

Förutsättningar (PowerShell, Windows 11):

    pip install --upgrade openai pillow
    $env:OPENAI_API_KEY = "sk-...din-nyckel..."
    python ai_media_gui.py
"""

import os
import time
import base64
import threading
from pathlib import Path
from typing import Optional, Callable

from openai import OpenAI

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from PIL import Image


# ---------------------------------------------------------------------------
#  Gemensam hjälpfunktion: filnamn
# ---------------------------------------------------------------------------

def next_timestamped_filename(out_dir: Path, stem: str, suffix: str) -> Path:
    """
    Returnerar en unik sökväg i out_dir, typ:
        stem_2025-02-01_21-03-15.png
        stem_2025-02-01_21-03-15_1.png
        stem_2025-02-01_21-03-15_2.png
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    base_name = f"{stem}_{timestamp}"
    candidate = out_dir / f"{base_name}{suffix}"

    counter = 1
    while candidate.exists():
        candidate = out_dir / f"{base_name}_{counter}{suffix}"
        counter += 1

    return candidate


# ---------------------------------------------------------------------------
#  Bild: prompt-expansion + generering (gpt-image-1)
# ---------------------------------------------------------------------------

def expand_prompt_image(context: str, user_prompt: str) -> str:
    """
    Kombinera kontext + prompt och lägg till några små hintar om
    användaren skrivit något väldigt kort/oglaskigt.
    """
    context = context.strip()
    prompt = user_prompt.strip()

    if context:
        base = f"{prompt}\n\nContext: {context}"
    else:
        base = prompt

    # Lite automatisk "glazing" om prompten är väldigt knapp
    if len(base) < 60:
        base += (
            "\n\n"
            "Bildstil: high-detail, cinematic lighting, shallow depth of field, "
            "sharp focus, detailed textures, realistic rendering.\n"
            "Kvalitet: ultra high resolution, 8k, crisp details, professional composition, professional photography."
        )
    return base


def generate_image(
    prompt: str,
    out_dir: Path,
    size: str = "1024x1024",
    model: str = "gpt-image-1",
    quality: str = "high",
    output_format: str = "png",
) -> Optional[Path]:
    """
    Skapar en bild med GPT Image (gpt-image-1) och sparar den till out_dir.
    Returnerar sökvägen eller None vid fel.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[FEL] Miljövariabeln OPENAI_API_KEY saknas.")
        print("      Sätt den t.ex. i PowerShell:")
        print('      $env:OPENAI_API_KEY = "sk-...din-nyckel..."')
        return None

    client = OpenAI(api_key=api_key)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = next_timestamped_filename(out_dir, stem="ai-image", suffix=f".{output_format}")

    print("\n" + "=" * 70)
    print("[BILD] Genererar bild...")
    print("=" * 70)
    print(f"   Modell: {model}")
    print(f"   Upplösning: {size}")
    print(f"   Kvalitet: {quality}")
    print(f"   Format: {output_format}")
    print(f"   Prompt: {prompt[:120]}{'...' if len(prompt) > 120 else ''}")

    try:
        result = client.images.generate(
            model=model,
            prompt=prompt,
            size=size,               # "1024x1024", "1536x1024", "1024x1536" eller "auto"
            quality=quality,         # "low", "medium", "high" eller "auto"
            output_format=output_format,  # "png", "jpeg", "webp"
        )
    except Exception as e:
        print(f"[FEL] Kunde inte generera bild: {e}")
        return None

    try:
        image_base64 = result.data[0].b64_json
        image_bytes = base64.b64decode(image_base64)

        with open(out_path, "wb") as f:
            f.write(image_bytes)

        print(f"[OK] Bild sparad: {out_path.resolve()}")
        return out_path
    except Exception as e:
        print(f"[FEL] Kunde inte spara bild: {e}")
        return None


def generate_image_with_reference(
    prompt: str,
    reference_path: Path,
    out_dir: Path,
    size: str = "1024x1024",
    model: str = "gpt-image-1",
    quality: str = "high",
    output_format: str = "png",
) -> Optional[Path]:
    """
    Skapar en bild baserat på en referensbild + prompt.
    Använder GPT Image (gpt-image-1) via images.edit och sparar resultatet.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[FEL] Miljövariabeln OPENAI_API_KEY saknas.")
        print("      Sätt den t.ex. i PowerShell:")
        print('      $env:OPENAI_API_KEY = "sk-...din-nyckel..."')
        return None

    client = OpenAI(api_key=api_key)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = next_timestamped_filename(out_dir, stem="ai-image-ref", suffix=f".{output_format}")

    print("\n" + "=" * 70)
    print("[BILD] Genererar bild från referens...")
    print("=" * 70)
    print(f"   Modell: {model}")
    print(f"   Upplösning: {size}")
    print(f"   Kvalitet: {quality}")
    print(f"   Format: {output_format}")
    print(f"   Referensbild: {reference_path}")
    print(f"   Prompt: {prompt[:120]}{'...' if len(prompt) > 120 else ''}")

    try:
        with open(reference_path, "rb") as ref_file:
            result = client.images.edit(
                model=model,
                image=[ref_file],
                prompt=prompt,
                size=size,
                quality=quality,
                output_format=output_format,
            )
    except Exception as e:
        print(f"[FEL] Kunde inte generera bild från referens: {e}")
        return None

    try:
        image_base64 = result.data[0].b64_json
        image_bytes = base64.b64decode(image_base64)

        with open(out_path, "wb") as f:
            f.write(image_bytes)

        print(f"[OK] Bild (från referens) sparad: {out_path.resolve()}")
        return out_path
    except Exception as e:
        print(f"[FEL] Kunde inte spara referens-bild: {e}")
        return None


# ---------------------------------------------------------------------------
#  Video: prompt-expansion + referensbild-hantering + generering (Sora 2)
# ---------------------------------------------------------------------------

def expand_prompt_video(context: str, user_prompt: str) -> str:
    """
    Kombinerar kontext + prompt och lägger till några filmiska hintar
    om texten är väldigt kort, så att resultatet blir lite stabilare.
    """
    context = context.strip()
    prompt = user_prompt.strip()

    base = f"{prompt}\n\nContext: {context}".strip()

    if len(base) < 60:
        base += (
            "\n\n"
            "Videostil: cinematic, natural camera movement, depth of field, detailed lighting.\n"
            "Kvalitet: high resolution, realistic motion, stable framing."
        )
    return base


def prepare_reference_image(
    original_path: Path,
    size_str: str,
    out_dir: Path,
) -> Optional[Path]:
    """
    Tar en godtycklig bild, beskär + skalar den till korrekt aspect ratio
    för Sora (enligt 'size_str') och sparar i out_dir som PNG.
    Returnerar sökvägen eller None vid fel.
    """
    try:
        width, height = (int(part) for part in size_str.lower().split("x"))
    except Exception:
        print(f"[VARN] Ogiltig size-sträng för referensbild: {size_str!r}")
        return None

    try:
        img = Image.open(original_path).convert("RGB")
    except Exception as e:
        print(f"[VARN] Kunde inte öppna referensbild: {e}")
        return None

    ow, oh = img.size
    orig_ratio = ow / oh
    target_ratio = width / height

    # Beskär för att matcha aspect ratio
    if orig_ratio > target_ratio:
        # För bred -> beskär vänster/höger
        new_w = int(oh * target_ratio)
        offset = (ow - new_w) // 2
        box = (offset, 0, offset + new_w, oh)
    else:
        # För hög -> beskär topp/botten
        new_h = int(ow / target_ratio)
        offset = (oh - new_h) // 2
        box = (0, offset, ow, offset + new_h)

    img = img.crop(box)
    img = img.resize((width, height), Image.LANCZOS)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    out_path = next_timestamped_filename(out_dir, stem="sora-ref", suffix=".png")
    try:
        img.save(out_path, format="PNG")
    except Exception as e:
        print(f"[VARN] Kunde inte spara förberedd referensbild: {e}")
        return None

    return out_path


def generate_video(
    prompt: str,
    out_dir: Path,
    seconds: int = 8,
    size: str = "1280x720",
    model: str = "sora-2",
    input_reference_path: Optional[Path] = None,
    poll_interval: int = 6,
    max_wait_seconds: int = 10 * 60,
    status_callback: Optional[Callable[[str, int], None]] = None,
) -> Optional[Path]:
    """
    Skapar videouppgift, pollar tills klar och laddar ner MP4 till out_dir.

    - input_reference_path: valfri bild som Sora använder som referens.
      Bilden anpassas automatiskt (skalas/beskärs) till 'size'.
    - status_callback(status, progress): kallas med status + procent.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[FEL] Miljövariabeln OPENAI_API_KEY saknas.")
        return None

    client = OpenAI(api_key=api_key)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = next_timestamped_filename(out_dir, stem="ai-video", suffix=".mp4")

    print("\n" + "=" * 70)
    print("[VIDEO] Skapar uppgift...")
    print("=" * 70)
    print(f"   Modell: {model}")
    print(f"   Längd: {seconds}s")
    print(f"   Upplösning: {size}")
    print(f"   Prompt: {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    if input_reference_path:
        print(f"   Referensbild (original): {input_reference_path}")

    # Bygg parametrar
    params = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "seconds": str(seconds),
    }

    # Om referensbild valts → försök anpassa den till rätt upplösning
    file_obj = None
    prepared_path = None
    if input_reference_path:
        prepared_path = prepare_reference_image(
            original_path=input_reference_path,
            size_str=size,
            out_dir=out_dir,  # lägg tempfil i samma mapp som videon
        )
        if prepared_path is None:
            print("[VARN] Kan inte förbereda referensbild, kör utan input_reference.")
        else:
            try:
                file_obj = open(prepared_path, "rb")
                params["input_reference"] = file_obj
                print(f"   Referensbild (anpassad): {prepared_path}")
            except Exception as e:
                print(f"[VARN] Kunde inte öppna förberedd bild: {e}")
                file_obj = None

    try:
        job = client.videos.create(**params)
    except Exception as e:
        print(f"[FEL] Kunde inte skapa video-uppgift: {e}")
        if file_obj:
            file_obj.close()
        return None
    finally:
        if file_obj:
            file_obj.close()

    job_id = getattr(job, "id", None)
    if not job_id:
        print("[FEL] Inget job-id i svaret.")
        return None

    print(f"   Jobb-ID: {job_id}")

    start = time.time()
    last_progress = -1
    poll_count = 0
    bar_len = 28

    def update_status(status: str, progress: int) -> None:
        if status_callback:
            try:
                status_callback(status, progress)
            except Exception:
                pass

    while True:
        if time.time() - start > max_wait_seconds:
            print("\n[TIMEOUT] Uppgiften överskred tidsgränsen.")
            print(f"   Spara jobbid och försök senare: {job_id}")
            update_status("timeout", last_progress if last_progress >= 0 else 0)
            return None

        try:
            status_obj = client.videos.retrieve(job_id)
        except Exception as e:
            print(f"[VARN] Poll-fel: {e}")
            time.sleep(poll_interval)
            continue

        status = getattr(status_obj, "status", "unknown")
        progress = getattr(status_obj, "progress", None)

        if progress is None:
            # hitta ev. "percent_complete" i extra fält
            progress = getattr(status_obj, "percent_complete", None)

        # Försök mappa till int 0–100
        try:
            progress_int = int(progress)
        except Exception:
            progress_int = last_progress

        last_progress = progress_int if progress_int is not None else last_progress

        # Skriv en enkel progress-bar då och då
        poll_count += 1
        if poll_count % 2 == 0 and progress_int is not None:
            filled = int(bar_len * progress_int / 100)
            bar = "#" * filled + "-" * (bar_len - filled)
            print(f"\r[{bar}] {progress_int:3d}%  status={status:10s}", end="", flush=True)

        update_status(status, progress_int if progress_int is not None else 0)

        if status == "completed":
            print("\n[OK] Renderingen är klar. Hämtar video...")
            try:
                content = client.videos.download_content(job_id)

                out_path.parent.mkdir(parents=True, exist_ok=True)
                if hasattr(content, "write_to_file"):
                    content.write_to_file(str(out_path))
                else:
                    with open(out_path, "wb") as f:
                        if hasattr(content, "iter_bytes"):
                            for chunk in content.iter_bytes():
                                f.write(chunk)
                        elif hasattr(content, "read"):
                            f.write(content.read())
                        elif hasattr(content, "content"):
                            f.write(content.content)
                        else:
                            raise RuntimeError("Okänt innehållsobjekt från SDK.")

                print(f"[OK] Sparad: {out_path.resolve()}")
                update_status("completed", 100)
                return out_path
            except Exception as e:
                print(f"[FEL] Nedladdning misslyckades: {e}")
                update_status("failed", last_progress if last_progress >= 0 else 0)
                return None

        if status == "failed":
            print("\n[FEL] Videouppgiften misslyckades.")
            print(f"   Detaljer: {getattr(status_obj, 'error', 'okänt fel')}")
            update_status("failed", last_progress if last_progress >= 0 else 0)
            return None

        time.sleep(poll_interval)


# ---------------------------------------------------------------------------
#  Tkinter-GUI
# ---------------------------------------------------------------------------

class MediaGUI:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("AI Media Generator (Bild + Video)")
        self.root.geometry("720x520")

        # Tk-variabler
        self.mode_var = tk.StringVar(value="image")  # "image" eller "video"
        self.context_var = tk.StringVar(value="")
        self.image_size_var = tk.StringVar(value="1024x1024")
        self.image_quality_var = tk.StringVar(value="high")
        self.image_format_var = tk.StringVar(value="png")

        self.video_size_var = tk.StringVar(value="1280x720")
        self.video_seconds_var = tk.IntVar(value=8)
        self.video_model_var = tk.StringVar(value="sora-2")

        self.video_ref_image_path = tk.StringVar(value="")
        self.image_ref_path = tk.StringVar(value="")

        self.status_var = tk.StringVar(value="Redo.")

        self._build_widgets()
        self._on_mode_changed()  # sätt initialt läge

    # ------------------------------------------------------------------

    def _build_widgets(self) -> None:
        main = ttk.Frame(self.root, padding=10)
        main.grid(row=0, column=0, sticky="nsew")

        self.root.rowconfigure(0, weight=1)
        self.root.columnconfigure(0, weight=1)

        # Rad 0: lägesval
        mode_frame = ttk.Frame(main)
        mode_frame.grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 5))

        ttk.Label(mode_frame, text="Läge:").grid(row=0, column=0, sticky="w", padx=(0, 5))

        ttk.Radiobutton(
            mode_frame,
            text="Bild",
            variable=self.mode_var,
            value="image",
            command=self._on_mode_changed,
        ).grid(row=0, column=1, sticky="w", padx=5, pady=4)

        ttk.Radiobutton(
            mode_frame,
            text="Video (Sora 2)",
            variable=self.mode_var,
            value="video",
            command=self._on_mode_changed,
        ).grid(row=0, column=2, sticky="w", padx=5, pady=4)

        # Rad 1: kontext
        ttk.Label(main, text="Kontext:").grid(row=1, column=0, sticky="nw")
        self.context_entry = ttk.Entry(main, textvariable=self.context_var)
        self.context_entry.grid(row=1, column=1, sticky="ew", pady=3)
        main.columnconfigure(1, weight=1)

        # Rad 2: prompt (multirad)
        ttk.Label(main, text="Prompt / beskrivning:").grid(row=2, column=0, sticky="nw")
        self.prompt_text = tk.Text(main, height=5, width=60)
        self.prompt_text.grid(row=2, column=1, sticky="nsew", pady=3)

        main.rowconfigure(2, weight=1)

        # Rad 3: bild-inställningar
        self.image_frame = ttk.LabelFrame(main, text="Bildinställningar")
        self.image_frame.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(10, 5))
        self._build_image_frame(self.image_frame)

        # Rad 4: video-inställningar
        self.video_frame = ttk.LabelFrame(main, text="Videoinställningar")
        self.video_frame.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        self._build_video_frame(self.video_frame)

        # Rad 5: status + knappar
        bottom = ttk.Frame(main)
        bottom.grid(row=5, column=0, columnspan=2, sticky="ew", pady=(5, 0))
        bottom.columnconfigure(0, weight=1)

        self.status_label = ttk.Label(bottom, textvariable=self.status_var)
        self.status_label.grid(row=0, column=0, sticky="w")

        btn_frame = ttk.Frame(bottom)
        btn_frame.grid(row=0, column=1, sticky="e")

        self.generate_button = ttk.Button(btn_frame, text="Generera", command=self._on_generate_clicked)
        self.generate_button.grid(row=0, column=0, padx=(0, 5))

        ttk.Button(btn_frame, text="Avsluta", command=self.root.destroy).grid(row=0, column=1)

    # ------------------------------------------------------------------

    def _build_image_frame(self, frame: ttk.LabelFrame) -> None:
        # Upplösning
        ttk.Label(frame, text="Upplösning:").grid(row=0, column=0, sticky="w", padx=5, pady=3)
        size_combo = ttk.Combobox(
            frame,
            textvariable=self.image_size_var,
            values=["1024x1024", "1536x1024", "1024x1536", "auto"],
            state="readonly",
            width=12,
        )
        size_combo.grid(row=0, column=1, sticky="w", padx=5, pady=3)

        # Kvalitet
        ttk.Label(frame, text="Kvalitet:").grid(row=1, column=0, sticky="w", padx=5, pady=3)
        quality_combo = ttk.Combobox(
            frame,
            textvariable=self.image_quality_var,
            values=["low", "medium", "high", "auto"],
            state="readonly",
            width=12,
        )
        quality_combo.grid(row=1, column=1, sticky="w", padx=5, pady=3)

        # Format
        ttk.Label(frame, text="Format:").grid(row=2, column=0, sticky="w", padx=5, pady=3)
        format_combo = ttk.Combobox(
            frame,
            textvariable=self.image_format_var,
            values=["png", "jpeg", "webp"],
            state="readonly",
            width=12,
        )
        format_combo.grid(row=2, column=1, sticky="w", padx=5, pady=3)

        # Referensbild (för stillbild)
        ttk.Label(frame, text="Referensbild (valfri):").grid(row=3, column=0, sticky="w", padx=5, pady=3)
        ref_frame = ttk.Frame(frame)
        ref_frame.grid(row=3, column=1, sticky="ew", padx=5, pady=3)
        ref_frame.columnconfigure(0, weight=1)

        self.image_ref_entry = ttk.Entry(ref_frame, textvariable=self.image_ref_path)
        self.image_ref_entry.grid(row=0, column=0, sticky="ew")

        ttk.Button(ref_frame, text="Bläddra...", command=self._on_browse_image_for_image).grid(
            row=0, column=1, padx=(5, 0)
        )

        ttk.Label(
            frame,
            text="(PNG funkar bra som standard. Storlek/kvalitet påverkar pris och tid.)",
        ).grid(row=4, column=0, columnspan=2, sticky="w", padx=5, pady=(2, 5))

    # ------------------------------------------------------------------

    def _build_video_frame(self, frame: ttk.LabelFrame) -> None:
        # Modell
        ttk.Label(frame, text="Modell:").grid(row=0, column=0, sticky="w", padx=5, pady=3)
        model_combo = ttk.Combobox(
            frame,
            textvariable=self.video_model_var,
            values=["sora-2"],
            state="readonly",
            width=12,
        )
        model_combo.grid(row=0, column=1, sticky="w", padx=5, pady=3)

        # Längd
        ttk.Label(frame, text="Längd (sek):").grid(row=1, column=0, sticky="w", padx=5, pady=3)
        sec_spin = ttk.Spinbox(
            frame,
            from_=1,
            to=30,
            textvariable=self.video_seconds_var,
            width=6,
        )
        sec_spin.grid(row=1, column=1, sticky="w", padx=5, pady=3)

        # Upplösning
        ttk.Label(
            frame,
            text="Upplösning:",
        ).grid(row=2, column=0, sticky="w", padx=5, pady=3)
        video_size_combo = ttk.Combobox(
            frame,
            textvariable=self.video_size_var,
            values=[
                "1280x720",
                "1920x1080",
                "1024x1024",
                "1536x1024",
                "1024x1536",
            ],
            state="readonly",
            width=12,
        )
        video_size_combo.grid(row=2, column=1, sticky="w", padx=5, pady=3)

        # Referensbild (video)
        ttk.Label(frame, text="Referensbild (video, valfri):").grid(
            row=3,
            column=0,
            sticky="w",
            padx=5,
            pady=3,
        )
        ref_frame = ttk.Frame(frame)
        ref_frame.grid(row=3, column=1, sticky="ew", padx=5, pady=3)
        ref_frame.columnconfigure(0, weight=1)

        self.video_ref_entry = ttk.Entry(ref_frame, textvariable=self.video_ref_image_path)
        self.video_ref_entry.grid(row=0, column=0, sticky="ew")

        ttk.Button(ref_frame, text="Bläddra...", command=self._on_browse_image).grid(row=0, column=1, padx=(5, 0))

        ttk.Label(
            frame,
            text=(
                "Tips: välj en stillbild som ungefär motsvarar scenen. "
                "Den anpassas automatiskt till rätt storlek."
            ),
        ).grid(row=4, column=0, columnspan=2, sticky="w", padx=5, pady=(2, 5))

    # ------------------------------------------------------------------

    def _on_browse_image(self) -> None:
        path = filedialog.askopenfilename(
            title="Välj referensbild",
            filetypes=[
                ("Bildfiler", "*.png;*.jpg;*.jpeg;*.webp"),
                ("Alla filer", "*.*"),
            ],
        )
        if path:
            self.video_ref_image_path.set(path)

    def _on_browse_image_for_image(self) -> None:
        path = filedialog.askopenfilename(
            title="Välj referensbild för stillbild",
            filetypes=[
                ("Bildfiler", "*.png;*.jpg;*.jpeg;*.webp"),
                ("Alla filer", "*.*"),
            ],
        )
        if path:
            self.image_ref_path.set(path)

    # ------------------------------------------------------------------

    def _on_mode_changed(self) -> None:
        mode = self.mode_var.get()
        if mode == "image":
            self.image_frame.grid()
            self.video_frame.grid_remove()
        else:
            self.video_frame.grid()
            self.image_frame.grid_remove()

    # ------------------------------------------------------------------

    def _set_status(self, text: str) -> None:
        self.root.after(0, lambda: self.status_var.set(text))

    def _set_generate_enabled(self, enabled: bool) -> None:
        def update() -> None:
            state = "normal" if enabled else "disabled"
            self.generate_button.configure(state=state)

        self.root.after(0, update)

    # ------------------------------------------------------------------

    def _on_generate_clicked(self) -> None:
        # Läs prompt och kontext
        context = self.context_var.get().strip()
        prompt = self.prompt_text.get("1.0", "end").strip()

        if not prompt:
            messagebox.showwarning("Ingen prompt", "Skriv en prompt/beskrivning först.")
            return

        if not os.getenv("OPENAI_API_KEY"):
            messagebox.showerror(
                "OPENAI_API_KEY saknas",
                "Miljövariabeln OPENAI_API_KEY saknas.\n\n"
                "Sätt den t.ex. i PowerShell:\n"
                '$env:OPENAI_API_KEY = "sk-...din-nyckel..."',
            )
            return

        mode = self.mode_var.get()

        # Läs alla inställningar *innan* vi startar tråd
        image_size = self.image_size_var.get()
        image_quality = self.image_quality_var.get()
        image_format = self.image_format_var.get()

        video_size = self.video_size_var.get()
        video_model = self.video_model_var.get()
        try:
            video_seconds = int(self.video_seconds_var.get())
        except Exception:
            video_seconds = 8

        # Referensbild för stillbild
        img_ref = self.image_ref_path.get().strip() or None
        if img_ref:
            image_ref_path = Path(img_ref)
        else:
            image_ref_path = None

        # Referensbild för video
        ref_image = self.video_ref_image_path.get().strip() or None
        if ref_image:
            ref_image_path = Path(ref_image)
        else:
            ref_image_path = None

        # Starta bakgrundstråd så att GUI inte fryser
        t = threading.Thread(
            target=self._run_generation_thread,
            args=(
                mode,
                context,
                prompt,
                image_size,
                image_quality,
                image_format,
                video_size,
                video_model,
                video_seconds,
                image_ref_path,
                ref_image_path,
            ),
            daemon=True,
        )
        t.start()

    # ------------------------------------------------------------------

    def _run_generation_thread(
        self,
        mode: str,
        context: str,
        prompt: str,
        image_size: str,
        image_quality: str,
        image_format: str,
        video_size: str,
        video_model: str,
        video_seconds: int,
        image_ref_path: Optional[Path],
        ref_image_path: Optional[Path],
    ) -> None:
        self._set_generate_enabled(False)

        cwd = Path.cwd()

        try:
            if mode == "image":
                self._set_status("Genererar bild...")

                full_prompt = expand_prompt_image(context, prompt)

                if image_ref_path is not None:
                    result = generate_image_with_reference(
                        prompt=full_prompt,
                        reference_path=image_ref_path,
                        out_dir=cwd,
                        size=image_size,
                        model="gpt-image-1",
                        quality=image_quality,
                        output_format=image_format,
                    )
                else:
                    result = generate_image(
                        prompt=full_prompt,
                        out_dir=cwd,
                        size=image_size,
                        model="gpt-image-1",
                        quality=image_quality,
                        output_format=image_format,
                    )

                if result:
                    self._set_status(f"[KLAR] Bild sparad: {result.name}")
                else:
                    self._set_status("[FEL] Kunde inte generera bild.")
            else:
                self._set_status("Skapar videojobb...")

                def status_cb(status: str, progress: int) -> None:
                    self._set_status(f"Video: {status} ({progress} %)")

                full_prompt = expand_prompt_video(context, prompt)
                result = generate_video(
                    prompt=full_prompt,
                    out_dir=cwd,
                    seconds=video_seconds,
                    size=video_size,
                    model=video_model,
                    input_reference_path=ref_image_path,
                    status_callback=status_cb,
                )
                if result:
                    self._set_status(f"[KLAR] Video sparad: {result.name}")
                else:
                    # status_cb har förmodligen redan skrivit mer detaljer
                    self._set_status("[FEL] Kunde inte generera video.")
        finally:
            self._set_generate_enabled(True)


def main() -> int:
    root = tk.Tk()
    app = MediaGUI(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
