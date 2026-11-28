"""Exercise the hosted listener and its persistent ledger without buying inference."""

from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from unittest.mock import patch

import server


class HostedStudioTest(unittest.TestCase):
    def test_chat_disabled_between_request_and_job_reservation(self):
        with TemporaryDirectory() as temp:
            cache = Path(temp)
            with patch.multiple(server, HOSTED=True, HOSTED_TOKEN="x" * 48, CACHE=cache,
                                DB=cache / "studio.sqlite3"):
                server.initialize()
                server.worker.close()
                earlier = server.settings()
                with closing(server.db()) as cx, cx:
                    cx.execute("INSERT OR REPLACE INTO settings VALUES(1,?)",
                               (json.dumps({**earlier, "enabled": False}),))
                with patch.object(server, "reserve_cost") as reserve, patch.object(server.POOL, "submit") as run:
                    with self.assertRaises(server.ChatSpeechDisabled):
                        server.submit("account-test", "Försenat svar", {**earlier, "method": "musetalk"})
                    reserve.assert_not_called()
                    run.assert_not_called()

    def test_monthly_stop_shares_one_allowance_and_renews_after_month_end(self):
        with TemporaryDirectory() as temp:
            cache = Path(temp)
            with patch.multiple(server, HOSTED=True, HOSTED_TOKEN="x" * 48, CACHE=cache,
                                DB=cache / "studio.sqlite3", MONTHLY_POLICY="1", MONTHLY_LIMIT=1,
                                GPU_LIMIT=0, VOICE_LIMIT=0), patch.object(server, "provider_key", return_value="test"):
                server.initialize()
                server.worker.close()
                with closing(server.db()) as cx, cx:
                    cx.execute("INSERT INTO jobs(id, voice) VALUES('job', 0)")
                def reserve(_):
                    try:
                        server.reserve_voice("job", 0.25)
                        return True
                    except ValueError:
                        return False
                with patch.object(server.time, "strftime", return_value="2026-11"):
                    server.reserve_warm_time(1800)
                    with ThreadPoolExecutor(4) as pool:
                        self.assertEqual(sum(pool.map(reserve, range(4))), 2)
                    server.initialize()
                    server.worker.close()
                    self.assertFalse(reserve(None))
                with patch.object(server.time, "strftime", return_value="2026-12"):
                    self.assertTrue(reserve(None))
                    with patch.multiple(server, MONTHLY_POLICY="off", MONTHLY_LIMIT=None):
                        server.reserve_voice("job", 800)
                    self.assertFalse(reserve(None))

    def test_hosted_ingress_and_persistence(self):
        with TemporaryDirectory() as temp:
            cache = Path(temp)
            token = "x" * 48
            with patch.multiple(server, HOSTED=True, HOSTED_TOKEN=token, CACHE=cache,
                                DB=cache / "studio.sqlite3", GPU_LIMIT=0, VOICE_LIMIT=0,
                                MONTHLY_POLICY="0", MONTHLY_LIMIT=0), \
                    patch.object(server, "provider_key", return_value="test"):
                server.initialize()
                self.addCleanup(server.worker.close)
                with ThreadingHTTPServer(("127.0.0.1", 0), server.Handler) as listener:
                    thread = Thread(target=listener.serve_forever, daemon=True)
                    thread.start()

                    def call(method, path, headers=None, data=None):
                        with closing(HTTPConnection(*listener.server_address, timeout=3)) as client:
                            client.request(method, path, body=data, headers=headers or {})
                            res = client.getresponse()
                            return res.status, res.read()

                    bridge = {"X-Alina-Bridge": token, "X-Alina-Owner": "account-test"}
                    try:
                        disabled = {**server.settings(), "enabled": False}
                        with patch.object(server, "settings", return_value=disabled), patch.object(server, "submit") as submit:
                            phrase = json.dumps({"kind": "reply", "text": "Avstängd chatt."})
                            for payload in (phrase, '{"kind":"welcome"}'):
                                self.assertEqual(call("POST", "/api/alina/speech", bridge, payload)[0], 409)
                            self.assertEqual(call("POST", "/api/alina/activity", bridge, "{}")[0], 409)
                            self.assertEqual(call("POST", "/api/alina/audition", {}, phrase)[0], 403)
                            submit.assert_not_called()
                            submit.return_value = {"id": "b" * 32, "status": "pending"}
                            self.assertEqual(call("POST", "/api/alina/audition", bridge, phrase)[0], 200)
                            submit.assert_called_once()
                        self.assertEqual(call("GET", "/healthz")[0], 200)
                        for path in ("/api/alina/config", "/api/admin/alina", "/SCEN/index.html"):
                            self.assertEqual(call("GET", path)[0], 403)
                        self.assertEqual(call("POST", "/api/alina/speech",
                                              {"Origin": "http://localhost:5814"}, "{}")[0], 403)
                        self.assertEqual(call("POST", "/api/alina/diagnostics", {},
                                              '{"check":"accounts"}')[0], 403)
                        self.assertEqual(call("POST", "/api/alina/diagnostics", bridge,
                                              '{"check":"unknown"}')[0], 400)
                        with patch.object(server, "accounts", return_value={"RunPod": "Kontosaldo 12 USD."}):
                            checked = json.loads(call("POST", "/api/alina/diagnostics", bridge,
                                                      '{"check":"accounts"}')[1])
                            self.assertIn("12 USD", checked["RunPod"])
                            self.assertIn("Nödbroms 0 USD", checked["Budget"])
                        self.assertEqual(call("GET", "/SCEN/index.html", bridge)[0], 404)
                        self.assertEqual(call("POST", "/internal/model/v1/chat/completions", bridge, "{}")[0], 404)
                        self.assertEqual(json.loads(call("GET", "/api/alina/runtime", bridge)[1])["status"], "sleeping")
                        job = "a" * 32
                        with closing(server.db()) as db, db:
                            db.execute("INSERT INTO jobs(id, owner, status) VALUES(?, ?, 'ready')",
                                       (job, "account-test"))
                        folder = cache / job
                        folder.mkdir()
                        (folder / "timings.json").write_text('{"method":"visemes"}')
                        (folder / "voice.wav").write_bytes(b"RIFFtest")
                        media = "/api/alina/media/" + job
                        self.assertEqual(call("GET", media, {**bridge, "Range": "bytes=0-3"}), (206, b"RIFF"))
                        stranger = {**bridge, "X-Alina-Owner": "account-other"}
                        self.assertEqual(call("GET", media, stranger)[0], 404)
                        self.assertEqual(call("GET", "/api/alina/jobs/" + job, stranger)[0], 404)
                        with closing(server.db()) as db, db:
                            db.execute("UPDATE jobs SET status='budget_stopped' WHERE id=?", (job,))
                        stopped = json.loads(call("GET", "/api/alina/jobs/" + job, bridge)[1])
                        self.assertEqual(stopped["status"], "failed")
                        self.assertIn("nödbroms", stopped["error"])
                        cfg = {**server.DEFAULT, "chance": 36}
                        self.assertEqual(call("POST", "/api/admin/alina", bridge, json.dumps(cfg))[0], 200)
                        with self.assertRaises(ValueError):
                            server.submit("account-test", "Prov", {**cfg, "method": "musetalk"})
                        with self.assertRaises(ValueError):
                            server.reserve_voice("denied", 1)
                    finally:
                        listener.shutdown()
                        thread.join()
                server.worker.close()
                server.initialize()
                self.addCleanup(server.worker.close)
                self.assertEqual(server.settings()["chance"], 36)
                self.assertFalse((cache / "bridge-token").exists())
