"""
Allabolag Scraper — GUI
Kör:  python app.py
"""

import asyncio
import json
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import ttk

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from scraper import run_scrape
from usage import get_usage, add_usage, get_limit, remaining, self_destruct, is_expired


def _load_branscher():
    p = Path(__file__).parent / "branscher.json"
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return [b["q"] for b in data]
    except Exception:
        return ["reklambyraer", "73111", "datakonsulter", "restaurang"]


# ── Tema ──────────────────────────────────────────────────────────────────────
BG       = "#1e1e2e"
SURFACE  = "#2a2a3e"
ACCENT   = "#7c6af7"
ACCENT_H = "#9b8df9"
TEXT     = "#cdd6f4"
MUTED    = "#6c7086"
SUCCESS  = "#a6e3a1"
ERROR    = "#f38ba8"
WARN     = "#fab387"
if sys.platform == "darwin":
    F_MAIN = ("Helvetica Neue", 10)
    F_MONO = ("Menlo", 9)
    F_TITLE = ("SF Pro Text", 13)
elif sys.platform == "win32":
    F_MAIN = ("Segoe UI", 10)
    F_MONO = ("Consolas", 9)
    F_TITLE = ("Segoe UI Semibold", 13)
else:
    F_MAIN = ("DejaVu Sans", 10)
    F_MONO = ("DejaVu Sans Mono", 9)
    F_TITLE = ("DejaVu Sans", 13)

PAD = {"padx": 16, "pady": 5}


def _label(parent, text, muted=False, **kw):
    return tk.Label(
        parent, text=text, font=F_MAIN,
        bg=BG, fg=MUTED if muted else TEXT, anchor="w", **kw,
    )


def _entry(parent, var, width=24):
    return tk.Entry(
        parent, textvariable=var, font=F_MAIN, width=width,
        bg=SURFACE, fg=TEXT, insertbackground=TEXT,
        relief="flat", highlightthickness=1,
        highlightbackground=MUTED, highlightcolor=ACCENT,
    )


def _spinbox(parent, var, lo=0, hi=9_999_999, width=14):
    return tk.Spinbox(
        parent, from_=lo, to=hi, textvariable=var,
        font=F_MAIN, width=width,
        bg=SURFACE, fg=TEXT, insertbackground=TEXT,
        relief="flat", highlightthickness=1,
        highlightbackground=MUTED, highlightcolor=ACCENT,
        buttonbackground=SURFACE,
    )


def _sep(parent, **kw):
    ttk.Separator(parent, orient="horizontal").grid(**kw)


# ── App ───────────────────────────────────────────────────────────────────────

class ScraperApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Allabolag Scraper")
        self.resizable(False, False)
        self.configure(bg=BG)
        self._running = False
        self._build()
        self._center()

    def _build(self):
        r = 0
        self._v: dict[str, tk.Variable] = {}

        # ── Titel ─────────────────────────────────────────────
        tk.Label(self, text="Allabolag Scraper", font=F_TITLE, bg=BG, fg=TEXT
                 ).grid(row=r, column=0, columnspan=4, padx=16, pady=(16, 2), sticky="w"); r += 1
        _label(self, "Skrapar bolagsfakta via segmentering eller bransch-sök", muted=True
               ).grid(row=r, column=0, columnspan=4, padx=16, sticky="w"); r += 1
        _sep(self, row=r, column=0, columnspan=4, sticky="ew", padx=16, pady=8); r += 1

        # ── Sökning ───────────────────────────────────────────
        _label(self, "SÖKNING", muted=True
               ).grid(row=r, column=0, columnspan=4, padx=16, sticky="w"); r += 1

        # Bolagsnamn (specifik sökning — tar prioritet om ifyllt)
        tk.Label(self, text="Bolagsnamn", font=F_MAIN, bg=BG, fg=TEXT,
                 anchor="w", width=22).grid(row=r, column=0, **PAD, sticky="w")
        self._v["company_name"] = tk.StringVar()
        _entry(self, self._v["company_name"], width=28
               ).grid(row=r, column=1, columnspan=2, **PAD, sticky="w")
        _label(self, "Lämna tomt = sök via bransch nedan", muted=True
               ).grid(row=r, column=3, padx=(0, 16), pady=5, sticky="w"); r += 1

        # Bransch
        tk.Label(self, text="Bransch / sökord", font=F_MAIN, bg=BG, fg=TEXT,
                 anchor="w", width=22).grid(row=r, column=0, **PAD, sticky="w")
        self._v["industry"] = tk.StringVar(value="reklambyraer")
        ttk.Combobox(
            self, textvariable=self._v["industry"],
            values=_load_branscher(), width=26, font=F_MAIN,
        ).grid(row=r, column=1, columnspan=2, **PAD, sticky="w")
        _label(self, "Nyckelord, SNI-kod eller bransch", muted=True
               ).grid(row=r, column=3, padx=(0, 16), pady=5, sticky="w"); r += 1

        # Antal
        self._field(r, "Antal bolag", "num", "3", "spin",
                    tip="Exakt antal i resultat-JSON"); r += 1

        # Delay
        self._field(r, "Delay (sekunder)", "delay", "2.0", "entry",
                    tip="Paus mellan requests (2 s rekommenderas)"); r += 1

        # Utdatamapp
        self._field(r, "Utdatamapp", "output_dir", "output", "entry",
                    tip="Relativ sökväg"); r += 1

        # Checkboxar
        self._headless = tk.BooleanVar(value=True)
        tk.Checkbutton(
            self, text="Headless (webbläsare i bakgrunden)",
            variable=self._headless,
            font=F_MAIN, bg=BG, fg=TEXT, activebackground=BG,
            activeforeground=TEXT, selectcolor=SURFACE,
        ).grid(row=r, column=0, columnspan=2, padx=16, pady=(2, 2), sticky="w")

        self._separate = tk.BooleanVar(value=False)
        tk.Checkbutton(
            self, text="Spara separata JSON-filer per bolag",
            variable=self._separate,
            font=F_MAIN, bg=BG, fg=TEXT, activebackground=BG,
            activeforeground=TEXT, selectcolor=SURFACE,
        ).grid(row=r, column=2, columnspan=2, padx=0, pady=(2, 2), sticky="w"); r += 1

        # Usage-info (bara i .exe-bygge)
        limit = get_limit()
        if limit is not None:
            used = get_usage()
            left = max(0, limit - used)
            self._usage_label = _label(
                self, f"Licens: {used}/{limit} bolag använda  ({left} kvar)", muted=True,
            )
            self._usage_label.grid(row=r, column=0, columnspan=4, padx=16, sticky="w"); r += 1

        _sep(self, row=r, column=0, columnspan=4, sticky="ew", padx=16, pady=6); r += 1

        # ── Segmentering / filter ─────────────────────────────
        _label(self, "SEGMENTERING  (skickas som filter i sökningen)", muted=True
               ).grid(row=r, column=0, columnspan=4, padx=16, sticky="w"); r += 1
        _label(self, "Fyll i minst ett fält nedan för att använda segmentering. "
               "Enheter: tusen SEK (1000 = 1 MSEK)", muted=True
               ).grid(row=r, column=0, columnspan=4, padx=16, sticky="w"); r += 1

        # Omsättning
        r = self._range_row(r, "Omsättning (×1000 SEK)", "rev_min", "rev_max")

        # Rörelseresultat
        r = self._range_row(r, "Rörelseresultat (×1000 SEK)", "profit_min", "profit_max")

        # Anställda
        r = self._range_row(r, "Anställda", "emp_min", "emp_max")

        # Bolagsform
        tk.Label(self, text="Bolagsform", font=F_MAIN, bg=BG, fg=TEXT,
                 anchor="w", width=22).grid(row=r, column=0, **PAD, sticky="w")
        self._v["company_type"] = tk.StringVar(value="Alla")
        ttk.Combobox(
            self, textvariable=self._v["company_type"],
            values=["Alla", "Aktiebolag", "Handelsbolag", "Enskild firma",
                    "Kommanditbolag", "Ekonomisk förening", "Ideell förening"],
            state="readonly", font=F_MAIN, width=20,
        ).grid(row=r, column=1, columnspan=3, padx=(0, 16), pady=5, sticky="w"); r += 1

        # Plats
        tk.Label(self, text="Plats / region", font=F_MAIN, bg=BG, fg=TEXT,
                 anchor="w", width=22).grid(row=r, column=0, **PAD, sticky="w")
        self._v["location"] = tk.StringVar()
        _entry(self, self._v["location"], width=28
               ).grid(row=r, column=1, columnspan=2, **PAD, sticky="w")
        _label(self, "T.ex. Stockholm, Göteborg (tomt = hela Sverige)", muted=True
               ).grid(row=r, column=3, padx=(0, 16), pady=5, sticky="w"); r += 1

        _sep(self, row=r, column=0, columnspan=4, sticky="ew", padx=16, pady=8); r += 1

        # ── Knappar ───────────────────────────────────────────
        self._btn = tk.Button(
            self, text="▶  Starta skrapning",
            font=("Segoe UI Semibold", 10),
            bg=ACCENT, fg="#ffffff", activebackground=ACCENT_H,
            relief="flat", cursor="hand2", padx=14, pady=6,
            command=self._start,
        )
        self._btn.grid(row=r, column=0, columnspan=2, padx=16, pady=4, sticky="w")

        tk.Button(
            self, text="📁  Öppna mapp", font=F_MAIN,
            bg=SURFACE, fg=TEXT, activebackground=BG,
            relief="flat", cursor="hand2", padx=10, pady=6,
            command=self._open_folder,
        ).grid(row=r, column=2, columnspan=2, padx=(0, 16), pady=4, sticky="e"); r += 1

        # Progressbar
        self._progress = ttk.Progressbar(self, mode="indeterminate", length=580)
        self._progress.grid(row=r, column=0, columnspan=4, padx=16, pady=(2, 6), sticky="ew"); r += 1

        # Logg
        log_frame = tk.Frame(self, bg=BG)
        log_frame.grid(row=r, column=0, columnspan=4, padx=16, pady=(0, 16), sticky="nsew")
        self._log_widget = tk.Text(
            log_frame, height=14, width=80,
            font=F_MONO, bg=SURFACE, fg=TEXT,
            insertbackground=TEXT, relief="flat",
            state="disabled", wrap="word",
        )
        sb = tk.Scrollbar(log_frame, command=self._log_widget.yview,
                          bg=SURFACE, troughcolor=BG)
        self._log_widget.configure(yscrollcommand=sb.set)
        self._log_widget.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        self._log_widget.tag_config("ok",    foreground=SUCCESS)
        self._log_widget.tag_config("err",   foreground=ERROR)
        self._log_widget.tag_config("warn",  foreground=WARN)
        self._log_widget.tag_config("muted", foreground=MUTED)
        self._log_widget.tag_config("bold",  foreground=TEXT,
                                    font=("Consolas", 9, "bold"))

        self.columnconfigure(3, weight=1)

    # ── Hjälpmetoder för formulär ─────────────────────────────────────────────

    def _field(self, row, label, key, default, kind, lo=1, hi=500, tip=""):
        tk.Label(self, text=label, font=F_MAIN, bg=BG, fg=TEXT,
                 anchor="w", width=22).grid(row=row, column=0, **PAD, sticky="w")
        var = tk.StringVar(value=default)
        w = _spinbox(self, var, lo=lo, hi=hi) if kind == "spin" else _entry(self, var, width=28)
        w.grid(row=row, column=1, columnspan=2, **PAD, sticky="w")
        self._v[key] = var
        if tip:
            _label(self, tip, muted=True).grid(row=row, column=3, padx=(0, 16), pady=5, sticky="w")

    def _range_row(self, row, label, key_min, key_max) -> int:
        tk.Label(self, text=label, font=F_MAIN, bg=BG, fg=TEXT,
                 anchor="w", width=22).grid(row=row, column=0, **PAD, sticky="w")
        _label(self, "från").grid(row=row, column=1, padx=(0, 4), sticky="e")
        self._v[key_min] = tk.StringVar()
        _entry(self, self._v[key_min], width=10).grid(row=row, column=2, padx=(0, 6), sticky="w")
        _label(self, "till").grid(row=row, column=2, padx=(130, 0), sticky="w")
        self._v[key_max] = tk.StringVar()
        _entry(self, self._v[key_max], width=10).grid(row=row, column=3, padx=(0, 16), sticky="w")
        return row + 1

    def _center(self):
        self.update_idletasks()
        w, h = self.winfo_width(), self.winfo_height()
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")

    # ── Logg ──────────────────────────────────────────────────────────────────

    def _log(self, text: str):
        self.after(0, self._append, text)

    def _append(self, text: str):
        self._log_widget.configure(state="normal")
        if text.startswith("  \u2713"):
            tag = "ok"
        elif text.startswith("  \u2717") or "error" in text.lower() or "fel:" in text.lower():
            tag = "err"
        elif text.startswith("[wait]") or text.startswith("[filter]"):
            tag = "muted"
        elif text.startswith("[done]"):
            tag = "bold"
        elif "Hittade" in text or "passerade" in text or "segmentering" in text.lower():
            tag = "warn"
        else:
            tag = None
        self._log_widget.insert("end", text + "\n", tag or "")
        self._log_widget.see("end")
        self._log_widget.configure(state="disabled")

    def _clear_log(self):
        self._log_widget.configure(state="normal")
        self._log_widget.delete("1.0", "end")
        self._log_widget.configure(state="disabled")

    # ── Värden ────────────────────────────────────────────────────────────────

    def _int_or_none(self, key: str):
        v = self._v[key].get().strip()
        return int(v) if v else None

    def _build_filters(self) -> dict:
        return {
            "revenue_min":  self._int_or_none("rev_min"),
            "revenue_max":  self._int_or_none("rev_max"),
            "profit_min":   self._int_or_none("profit_min"),
            "profit_max":   self._int_or_none("profit_max"),
            "emp_min":      self._int_or_none("emp_min"),
            "emp_max":      self._int_or_none("emp_max"),
            "company_type": self._v["company_type"].get(),
            "location":     self._v["location"].get().strip(),
        }

    # ── Actions ───────────────────────────────────────────────────────────────

    def _start(self):
        if self._running:
            return

        company_name = self._v["company_name"].get().strip()
        industry     = self._v["industry"].get().strip()
        output_dir   = self._v["output_dir"].get().strip() or "output"
        headless     = self._headless.get()

        try:
            num   = int(self._v["num"].get())
            delay = float(self._v["delay"].get())
        except ValueError:
            self._log("\u2717 Ogiltigt värde i Antal bolag eller Delay.")
            return

        if not company_name and not industry:
            self._log("\u2717 Ange bolagsnamn eller branschsökord.")
            return

        if is_expired():
            self._log("\u2717 Licensen har gått ut (utgångsdatum passerat).")
            self._log("[info] Programmet avslutas ...")
            self_destruct()
            self.after(2000, self.destroy)
            return

        left = remaining()
        if left is not None:
            if left <= 0:
                self._log("\u2717 Licensgränsen är nådd. Programmet kan inte skrapa fler bolag.")
                self._log("[info] Programmet avslutas ...")
                self_destruct()
                self.after(2000, self.destroy)
                return
            if num > left:
                self._log(f"[info] Bara {left} bolag kvar av licensen, begränsar till {left}.")
                num = left

        filters = self._build_filters()
        active  = {k: v for k, v in filters.items() if v not in (None, "Alla", "")}

        self._clear_log()
        if company_name:
            self._log(f"Bolagsnamn: {company_name}  |  Antal: {num}  |  Delay: {delay}s")
        else:
            self._log(f"Bransch: {industry}  |  Antal: {num}  |  Delay: {delay}s")
        if active:
            self._log(f"Filter:  {active}")
        self._log("\u2500" * 60)

        self._running = True
        self._btn.configure(state="disabled", text="Pågår\u2026")
        self._progress.start(12)

        separate = self._separate.get()

        threading.Thread(
            target=self._thread,
            args=(industry, num, delay, output_dir, filters, company_name, separate, headless),
            daemon=True,
        ).start()

    def _thread(self, industry, num, delay, output_dir, filters, company_name, separate, headless):
        scraped = 0
        try:
            asyncio.run(
                run_scrape(
                    industry=industry,
                    num_companies=num,
                    delay=delay,
                    output_dir=output_dir,
                    filters=filters,
                    company_name=company_name,
                    separate_files=separate,
                    headless=headless,
                    log=self._log,
                )
            )
            scraped = num
        except Exception as exc:
            self._log(f"  \u2717  Oväntat fel: {exc}")
        finally:
            if scraped > 0 and get_limit() is not None:
                total = add_usage(scraped)
                limit = get_limit()
                left = max(0, limit - total)
                self._log(f"[licens] {total}/{limit} bolag använda ({left} kvar)")
                if left <= 0:
                    self._log("[licens] Gränsen nådd. Programmet förstörs vid nästa start.")
                    self_destruct()
            self.after(0, self._done)

    def _done(self):
        self._progress.stop()
        self._running = False
        self._btn.configure(state="normal", text="\u25b6  Starta skrapning")
        limit = get_limit()
        if limit is not None:
            used = get_usage()
            left = max(0, limit - used)
            if hasattr(self, "_usage_label"):
                self._usage_label.configure(
                    text=f"Licens: {used}/{limit} bolag använda  ({left} kvar)"
                )

    def _open_folder(self):
        folder = Path(self._v["output_dir"].get().strip() or "output").resolve()
        folder.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            subprocess.Popen(["explorer", str(folder)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(folder)])
        else:
            subprocess.Popen(["xdg-open", str(folder)])


if __name__ == "__main__":
    ScraperApp().mainloop()
