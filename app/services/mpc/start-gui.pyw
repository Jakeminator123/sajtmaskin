"""
MPC Server GUI - Visuell statusindikator för sajtmaskin MPC-servern.
Dubbelklicka på denna fil för att starta servern med ett litet statusfönster.

Fönstret visar:
- Grön cirkel = servern körs
- Röd cirkel = servern är stoppad/kraschad
- Senaste händelser i en logg
"""

import subprocess
import threading
import tkinter as tk
from tkinter import scrolledtext
from pathlib import Path
import sys
import os
import queue
import time

# Sökvägar
SCRIPT_DIR = Path(__file__).parent
SERVER_SCRIPT = SCRIPT_DIR / "server.mjs"
APP_DIR = SCRIPT_DIR.parent.parent  # app/


class MCPServerGUI:
    def __init__(self):
        self.process = None
        self.running = False
        self.log_queue = queue.Queue()

        # Skapa huvudfönster
        self.root = tk.Tk()
        self.root.title("MCP Server")
        self.root.geometry("400x300")
        self.root.attributes("-topmost", True)  # Alltid överst
        self.root.resizable(True, True)

        # Placera fönstret uppe till höger
        screen_w = self.root.winfo_screenwidth()
        x_pos = screen_w - 420
        self.root.geometry(f"+{x_pos}+20")

        # Huvudram
        main_frame = tk.Frame(self.root, padx=10, pady=10)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Status-rad
        status_frame = tk.Frame(main_frame)
        status_frame.pack(fill=tk.X, pady=(0, 10))

        # Statusindikator (cirkel)
        self.status_canvas = tk.Canvas(status_frame, width=20, height=20, highlightthickness=0)
        self.status_canvas.pack(side=tk.LEFT)
        self.status_circle = self.status_canvas.create_oval(2, 2, 18, 18, fill="gray", outline="")

        # Statustext
        self.status_label = tk.Label(status_frame, text="Stoppad", font=("Segoe UI", 10))
        self.status_label.pack(side=tk.LEFT, padx=(8, 0))

        # Knappar
        btn_frame = tk.Frame(status_frame)
        btn_frame.pack(side=tk.RIGHT)

        self.start_btn = tk.Button(btn_frame, text="▶ Starta", command=self.start_server, width=8)
        self.start_btn.pack(side=tk.LEFT, padx=2)

        self.stop_btn = tk.Button(btn_frame, text="■ Stoppa", command=self.stop_server, width=8, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=2)

        # Info-text
        info_text = (
            "docs/  → Lägg dokumentation här (.txt, .json)\n"
            "logs/  → Felloggar sparas här\n"
        )
        info_label = tk.Label(main_frame, text=info_text, font=("Consolas", 9), fg="#666", justify=tk.LEFT)
        info_label.pack(fill=tk.X)

        # Logg-område
        log_label = tk.Label(main_frame, text="Serverlogg:", font=("Segoe UI", 9, "bold"))
        log_label.pack(anchor=tk.W, pady=(8, 2))

        self.log_area = scrolledtext.ScrolledText(main_frame, height=10, font=("Consolas", 9), state=tk.DISABLED)
        self.log_area.pack(fill=tk.BOTH, expand=True)

        # Stäng-hantering
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # Uppdatera logg periodiskt
        self.root.after(100, self.process_log_queue)

    def log(self, message: str):
        """Lägg till meddelande i logg-kön (trådsäkert)."""
        timestamp = time.strftime("%H:%M:%S")
        self.log_queue.put(f"[{timestamp}] {message}")

    def process_log_queue(self):
        """Hämta meddelanden från kön och visa i logg-området."""
        while not self.log_queue.empty():
            try:
                msg = self.log_queue.get_nowait()
                self.log_area.config(state=tk.NORMAL)
                self.log_area.insert(tk.END, msg + "\n")
                self.log_area.see(tk.END)
                self.log_area.config(state=tk.DISABLED)
            except queue.Empty:
                break

        self.root.after(100, self.process_log_queue)

    def update_status(self, running: bool, text: str):
        """Uppdatera statusindikator och text."""
        color = "#22c55e" if running else "#ef4444"  # Grön eller röd
        self.status_canvas.itemconfig(self.status_circle, fill=color)
        self.status_label.config(text=text)

        self.start_btn.config(state=tk.DISABLED if running else tk.NORMAL)
        self.stop_btn.config(state=tk.NORMAL if running else tk.DISABLED)

    def start_server(self):
        """Starta MCP-servern som subprocess."""
        if self.running:
            return

        self.log("Startar MPC-server...")
        self.update_status(True, "Startar...")

        try:
            # Kör Node.js servern
            self.process = subprocess.Popen(
                ["node", str(SERVER_SCRIPT)],
                cwd=str(APP_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            self.running = True

            # Läs stderr i bakgrunden (där servern loggar)
            threading.Thread(target=self._read_stderr, daemon=True).start()
            threading.Thread(target=self._monitor_process, daemon=True).start()

            self.update_status(True, "Körs")
            self.log("Server startad!")

        except Exception as e:
            self.log(f"Kunde inte starta: {e}")
            self.update_status(False, "Fel vid start")

    def _read_stderr(self):
        """Läs serverloggar från stderr."""
        if not self.process:
            return

        try:
            for line in self.process.stderr:
                text = line.decode("utf-8", errors="replace").strip()
                if text:
                    self.log(text)
        except Exception as e:
            self.log(f"Läsfel: {e}")

    def _monitor_process(self):
        """Övervaka om processen kraschar."""
        if not self.process:
            return

        self.process.wait()
        exit_code = self.process.returncode
        self.running = False

        if exit_code != 0:
            self.log(f"Server avslutades med kod {exit_code}")
            self.root.after(0, lambda: self.update_status(False, f"Kraschade (kod {exit_code})"))
        else:
            self.log("Server stoppades")
            self.root.after(0, lambda: self.update_status(False, "Stoppad"))

    def stop_server(self):
        """Stoppa MPC-servern."""
        if not self.running or not self.process:
            return

        self.log("Stoppar server...")
        try:
            self.process.terminate()
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.log("Tvingade stopp...")
            self.process.kill()

        self.running = False
        self.update_status(False, "Stoppad")
        self.log("Server stoppad")

    def on_close(self):
        """Stäng ner allt snyggt."""
        if self.running:
            self.stop_server()
        self.root.destroy()

    def run(self):
        """Kör GUI-loopen."""
        self.log("MPC Server GUI redo")
        self.log(f"Docs: {SCRIPT_DIR / 'docs'}")
        self.log(f"Logs: {SCRIPT_DIR / 'logs'}")
        self.root.mainloop()


if __name__ == "__main__":
    gui = MCPServerGUI()
    gui.run()

