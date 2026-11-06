import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from agent import Client, Executor, TaskError, child_environment, exclusive_lock, protect
from windows_process import JobProcess


@unittest.skipUnless(os.name == "nt", "Windows Job Object/DPAPI tests")
class AgentProcessTest(unittest.TestCase):
    def task(self, kind, timeout=15, duration=1):
        return dict(id=str(uuid.uuid4()), attempt=1, kind=kind, worktreeKey="fixture", timeoutSec=timeout, durationSec=duration)

    def test_real_git_ffmpeg_and_capability_fixtures(self):
        with tempfile.TemporaryDirectory() as temp:
            executor = Executor(Path(temp))
            capabilities = executor.capabilities()
            self.assertIn("GIT_FIXTURE", capabilities)
            self.assertIn("FFMPEG_FIXTURE", capabilities)
            git = executor.execute(self.task("GIT_FIXTURE"))
            self.assertRegex(git["gitCommit"], "^[a-f0-9]{40}$")
            video = executor.execute(self.task("FFMPEG_FIXTURE"))
            self.assertGreater(video["bytes"], 0)
            self.assertRegex(video["artifactSha256"], "^[a-f0-9]{64}$")
            self.assertTrue(executor.execute(self.task("CAPABILITY_PROBE"))["gitAvailable"])

    def test_verified_checkpoint_reuses_artifact_and_corruption_forces_rebuild(self):
        with tempfile.TemporaryDirectory() as temp:
            executor = Executor(Path(temp))
            task = self.task("GIT_FIXTURE")
            result = executor.execute(task)
            task.update(attempt=2, checkpoint={"attempt": 1, "result": result})
            original = executor.command
            executor.command = lambda *_: self.fail("Verified artifact should not execute another Git command")
            self.assertEqual(result, executor.execute(task))
            executor.command = original
            old = Path(temp) / "worktrees/fixture" / (task["id"] + "-1") / "fixture.txt"
            old.write_text("corrupt", encoding="utf-8")
            rebuilt = executor.execute(task)
            self.assertEqual(result["artifactSha256"], rebuilt["artifactSha256"])

    def test_timeout_cancellation_and_reject_paths_or_shell(self):
        with tempfile.TemporaryDirectory() as temp:
            executor = Executor(Path(temp))
            with self.assertRaisesRegex(TaskError, "TIMEOUT"):
                executor.execute(self.task("FFMPEG_FIXTURE", timeout=1, duration=30))
            def cancelled():
                raise TaskError("CANCELLED")
            executor.tick = cancelled
            with self.assertRaisesRegex(TaskError, "CANCELLED"):
                executor.execute(self.task("FFMPEG_FIXTURE", duration=30))
            bad = self.task("SHELL")
            with self.assertRaisesRegex(TaskError, "AGENT_ERROR"):
                executor.execute(bad)
            bad = self.task("GIT_FIXTURE")
            bad["worktreeKey"] = "../outside"
            with self.assertRaisesRegex(TaskError, "AGENT_ERROR"):
                executor.execute(bad)

    def test_exclusive_writer_is_enforced_across_processes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "writer.lock"
            script = "from agent import exclusive_lock,TaskError; import sys\ntry:\n with exclusive_lock(sys.argv[1]): sys.exit(0)\nexcept TaskError: sys.exit(17)"
            with exclusive_lock(path):
                second = subprocess.run([sys.executable, "-c", script, str(path)], capture_output=True)
                self.assertEqual(17, second.returncode)
            with exclusive_lock(path):
                pass

    def test_dpapi_and_child_environment_do_not_expose_credentials(self):
        secret = os.urandom(32)
        encrypted = protect(secret)
        self.assertNotIn(secret, encrypted)
        self.assertEqual(secret, protect(encrypted, decrypt=True))
        os.environ["CREATORFLOW_AGENT_ENROLLMENT_TOKEN"] = "fixture-private-enrollment"
        os.environ["CREATORFLOW_API_TOKEN"] = "fixture-private-browser"
        self.assertNotIn("CREATORFLOW_AGENT_ENROLLMENT_TOKEN", child_environment())
        self.assertNotIn("CREATORFLOW_API_TOKEN", child_environment())
        for origin in ["https://example.com", "http://127.0.0.1@example.com", "http://127.0.0.1/api", "http://127.0.0.1?token=x"]:
            with self.assertRaises(RuntimeError):
                Client(origin)

    def test_job_kills_descendants_on_close_and_owner_crash(self):
        # Test-only Python process trees; the runtime never accepts these commands as tasks.
        def alive(pid):
            import ctypes
            from ctypes import wintypes as w
            kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
            kernel.OpenProcess.restype = w.HANDLE
            kernel.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
            kernel.CloseHandle.argtypes = [w.HANDLE]
            handle = kernel.OpenProcess(0x100000, False, pid)
            if not handle:
                return False
            try:
                return kernel.WaitForSingleObject(handle, 0) == 258
            finally:
                kernel.CloseHandle(handle)
        with tempfile.TemporaryDirectory() as temp:
            marker = Path(temp) / "child.json"
            child_script = "import subprocess,sys,time,json,os; from pathlib import Path; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(90)']); Path(sys.argv[1]).write_text(json.dumps([os.getpid(),p.pid])); time.sleep(90)"
            owner_script = "from windows_process import JobProcess; from agent import child_environment; import sys,time; from pathlib import Path; p=JobProcess([sys.executable,'-c',sys.argv[1],sys.argv[2]],Path(sys.argv[3]),child_environment()); time.sleep(90)"
            for crash in [False, True]:
                if marker.exists():
                    marker.unlink()
                if crash:
                    owner = subprocess.Popen([sys.executable, "-c", owner_script, child_script, str(marker), temp], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    process = JobProcess([sys.executable, "-c", child_script, str(marker)], Path(temp), child_environment())
                deadline = time.monotonic() + 10
                while not marker.exists() and time.monotonic() < deadline:
                    time.sleep(0.05)
                self.assertTrue(marker.exists())
                pids = json.loads(marker.read_text())
                self.assertTrue(all(alive(pid) for pid in pids))
                if crash:
                    owner.terminate()
                    owner.wait(timeout=5)
                else:
                    process.close()
                deadline = time.monotonic() + 5
                while any(alive(pid) for pid in pids) and time.monotonic() < deadline:
                    time.sleep(0.05)
                self.assertFalse(any(alive(pid) for pid in pids))


if __name__ == "__main__":
    unittest.main()
