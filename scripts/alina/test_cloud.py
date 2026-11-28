"""Exercise the session lifecycle without provisioning cloud resources."""

from concurrent.futures import ThreadPoolExecutor
import threading
import time
import unittest

from cloud import WarmWorker


class FakePod:
    def __init__(self, _directory):
        self.jobs = []
        self.stopped = threading.Event()
        self.started = threading.Event()

    def start(self):
        self.started.set()
        return 0.01

    def request(self, *_args, **_kwargs):
        return {"status": "ready"}

    def render(self, folder):
        self.jobs.append(folder)
        return 0.02

    def close(self):
        self.stopped.set()


class WarmWorkerTests(unittest.TestCase):
    def test_overlapping_visitors_share_one_pod_then_wake_a_new_one(self):
        pods, reserved = [], []

        def create(directory):
            pod = FakePod(directory)
            pods.append(pod)
            return pod

        worker = WarmWorker(None, reserved.append, idle_seconds=0.4, factory=create)
        try:
            with ThreadPoolExecutor(4) as visitors:
                list(visitors.map(lambda _: worker.activity(), range(4)))
            self.assertEqual(worker.render("visitor-a"), 0.02)
            worker.activity()
            self.assertEqual(worker.render("visitor-b"), 0.02)
            expires = worker.until
            self.assertTrue(worker.ensure_active(worker.idle_seconds))
            self.assertEqual(worker.until, expires)
            self.assertEqual(len(pods), 1)
            self.assertEqual(pods[0].jobs, ["visitor-a", "visitor-b"])
            self.assertEqual(len(reserved), 1)
            # Reading status never extends the lease.
            limit = time.monotonic() + 3
            while not pods[0].stopped.wait(0.04):
                worker.status()
                if time.monotonic() > limit:
                    self.fail("Expired worker kept running")
            worker.activity()
            self.assertEqual(worker.render("after-sleep"), 0.02)
            self.assertEqual(len(pods), 2)
        finally:
            worker.close()
        self.assertTrue(pods[-1].stopped.is_set())

    def test_budget_refusal_never_starts_a_worker(self):
        def no_budget(_seconds):
            raise ValueError("budget")

        worker = WarmWorker(
            None, no_budget, factory=lambda _: self.fail("unexpected GPU")
        )
        try:
            with self.assertRaises(ValueError):
                worker.activity()
            self.assertEqual(worker.status()["status"], "sleeping")
        finally:
            worker.close()

    def test_expiry_during_a_render_waits_for_the_finished_clip(self):
        active, release = threading.Event(), threading.Event()

        class Busy(FakePod):
            def render(self, folder):
                active.set()
                release.wait(4)
                return super().render(folder)

        pod = Busy(None)
        worker = WarmWorker(
            None, lambda _: None, idle_seconds=0.08, factory=lambda _: pod
        )
        try:
            with ThreadPoolExecutor(1) as pool:
                work = pool.submit(worker.render, "pending")
                self.assertTrue(active.wait(3))
                self.assertFalse(pod.stopped.wait(0.16))
                release.set()
                self.assertEqual(work.result(3), 0.02)
                self.assertTrue(pod.stopped.wait(3))
        finally:
            release.set()
            worker.close()


if __name__ == "__main__":
    unittest.main()
