"""Local acceptance harness. Runs actual backend/agent process restart recovery.

Browser mutation acceptance is performed separately through Playwright. Secrets
come from environment or an explicit current-user DPAPI bundle, never CLI text.
"""
import argparse
import ctypes
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import uuid
from agent import protect


def wait(predicate, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            result = predicate()
            if result:
                return result
        except (OSError, ValueError):
            pass
        time.sleep(0.25)
    raise RuntimeError("Acceptance condition timed out")


def alive(pid):
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


def main(args):
    if args.secrets:
        bundle = json.loads(protect(Path(args.secrets).read_bytes(), decrypt=True))
        os.environ["CREATORFLOW_API_TOKEN"] = bundle["browser"]
        os.environ["CREATORFLOW_AGENT_ENROLLMENT_TOKEN"] = bundle["enrollment"]
    root = Path(args.root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    output = Path(args.evidence).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    def api(path, payload=None):
        request = urllib.request.Request(args.backend + "/api/v2/" + path,
            None if payload is None else json.dumps(payload).encode(),
            {"Authorization": "Bearer " + os.environ["CREATORFLOW_API_TOKEN"], "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=3) as response:
            return json.load(response)
    log = open(output.parent / "agent-e2e-worker.log", "ab")
    def start_agent():
        return subprocess.Popen([sys.executable, str(Path(__file__).with_name("agent.py")), "--backend", args.backend,
            "--root", str(root), "--name", "E2E Recovery Agent"], stdout=log, stderr=log)
    worker = start_agent()
    backend = None
    try:
        identity = wait(lambda: next((a for a in api("agents") if a["name"] == "E2E Recovery Agent" and a["status"] == "ONLINE"), None))
        agent_id = identity["id"]
        wait(lambda: set(next(a for a in api("agents") if a["id"] == agent_id)["capabilities"]) == {"GIT_FIXTURE", "FFMPEG_FIXTURE", "CAPABILITY_PROBE"})
        def enqueue(kind, duration=1, timeout=20):
            body = dict(agentId=agent_id, kind=kind, worktreeKey="e2e-fixture", idempotencyKey=str(uuid.uuid4()), timeoutSec=timeout, durationSec=duration)
            task = api("agent-tasks", body)
            assert api("agent-tasks", body)["id"] == task["id"]
            return task["id"]
        def task(id):
            return api("agent-tasks/" + id)
        def state(id, expected, seconds=30):
            return wait(lambda: (t if (t := task(id))["state"] == expected else None), seconds)
        def child(id):
            def read():
                journal = json.loads((root / "active-process.json").read_text())
                return journal["pid"] if journal["taskId"] == id else None
            return wait(read)
        git_id = enqueue("GIT_FIXTURE")
        git = state(git_id, "SUCCEEDED")
        assert len(git["result"]["gitCommit"]) == 40
        ff_id = enqueue("FFMPEG_FIXTURE")
        video = state(ff_id, "SUCCEEDED")
        assert video["result"]["bytes"] > 0
        cancel_id = enqueue("FFMPEG_FIXTURE", duration=20, timeout=30)
        state(cancel_id, "RUNNING")
        cancelled_pid = child(cancel_id)
        api("agent-tasks/" + cancel_id + "/cancel", {})
        state(cancel_id, "CANCELLED")
        wait(lambda: not alive(cancelled_pid), 5)
        timeout_id = enqueue("FFMPEG_FIXTURE", duration=20, timeout=1)
        assert state(timeout_id, "FAILED")["errorCode"] == "TIMEOUT"
        restart_id = enqueue("FFMPEG_FIXTURE", duration=8, timeout=20)
        state(restart_id, "RUNNING")
        first_pid = child(restart_id)
        first_session = next(a for a in api("agents") if a["id"] == agent_id)["sessionId"]
        worker.terminate()
        worker.wait(timeout=5)
        wait(lambda: not alive(first_pid), 5)
        wait(lambda: next(a for a in api("agents") if a["id"] == agent_id)["status"] == "OFFLINE", 15)
        worker = start_agent()
        recovered = state(restart_id, "SUCCEEDED", 35)
        assert recovered["attempt"] == 2
        assert next(a for a in api("agents") if a["id"] == agent_id)["sessionId"] != first_session
        assert any(e["type"] == "LEASE_EXPIRED_QUEUED" for e in api("agent-tasks/" + restart_id + "/events"))
        backend_restart_id = enqueue("FFMPEG_FIXTURE", duration=8, timeout=20)
        state(backend_restart_id, "RUNNING")
        backend_child_pid = child(backend_restart_id)
        # Terminate only the exact acceptance backend PID supplied by the launcher.
        os.kill(args.backend_pid, 15)
        wait(lambda: not alive(backend_child_pid), 8)  # Agent fails closed when renewal is unavailable.
        java = Path(os.environ["JAVA_HOME"]) / "bin/java.exe"
        backend_log = open(output.parent / "agent-backend-restart.log", "ab")
        backend = subprocess.Popen([str(java), "-jar", str(Path(args.backend_jar).resolve())], stdout=backend_log, stderr=backend_log)
        after_backend = state(backend_restart_id, "SUCCEEDED", 45)
        assert after_backend["attempt"] == 2
        assert task(git_id)["result"] == git["result"]
        evidence = dict(agentId=agent_id, gitTask=git_id, ffmpegTask=ff_id, cancellationTask=cancel_id,
            timeoutTask=timeout_id, agentRestartTask=restart_id, backendRestartTask=backend_restart_id,
            agentRestartAttempt=recovered["attempt"], backendRestartAttempt=after_backend["attempt"],
            processTreeCleanup=True, offlineObserved=True, dpapiIdentityReused=True,
            persistedGitResult=git["result"], persistedFfmpegResult=video["result"])
        output.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        print("Agent E2E PASS: Git, FFmpeg, cancellation, timeout, offline, agent/backend restart; attempt fencing evidence persisted")
    finally:
        if worker.poll() is None:
            worker.terminate()
            worker.wait(timeout=5)
        if backend and backend.poll() is None:
            backend.terminate()
            backend.wait(timeout=5)
        log.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://127.0.0.1:8082")
    parser.add_argument("--root", required=True)
    parser.add_argument("--secrets")
    parser.add_argument("--backend-pid", type=int, required=True)
    parser.add_argument("--backend-jar", required=True)
    parser.add_argument("--evidence", default="storage/agent-e2e-evidence.json")
    try:
        main(parser.parse_args())
    except Exception:
        print("Agent E2E FAILED; inspect scoped task state and local evidence (no credentials logged)")
        raise SystemExit(1)
