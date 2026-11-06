"""CreatorFlow Windows agent. Python stdlib only; fixed fixture task kinds only."""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import sys
import time
import urllib.request
import urllib.parse
import uuid
from contextlib import contextmanager
from windows_process import JobProcess

# Keep runtime and imported adapters on one exception/lock module when launched as a script.
if __name__ == '__main__':
    sys.modules.setdefault('agent',sys.modules[__name__])

VERSION = "0.1.0"
KINDS = {"GIT_FIXTURE", "FFMPEG_FIXTURE", "CAPABILITY_PROBE"}


class TaskError(Exception):
    pass


@contextmanager
def exclusive_lock(path):
    import msvcrt
    handle = open(path, "a+b")
    try:
        handle.seek(0)
        if os.fstat(handle.fileno()).st_size == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise TaskError("WORKTREE_BUSY") from None
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    finally:
        handle.close()


def protect(data, decrypt=False):
    """Current Windows user DPAPI; no plaintext credential file fallback."""
    class Blob(ctypes.Structure):
        _fields_ = [("length", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    target = Blob()
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    function = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                         ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise RuntimeError("DPAPI credential operation failed")
    try:
        return ctypes.string_at(target.data, target.length)
    finally:
        kernel = ctypes.WinDLL("kernel32")
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree(target.data)


def windows_system_drive():
    """Accept only the host drive reported by Windows, never a caller-supplied path."""
    if os.name != 'nt':
        return None
    directory = ctypes.create_unicode_buffer(32768)
    if not ctypes.windll.kernel32.GetWindowsDirectoryW(directory, len(directory)):
        return None
    drive = Path(directory.value).drive
    supplied = os.environ.get('SYSTEMDRIVE', '')
    return drive if re.fullmatch(r'[A-Za-z]:', supplied) and supplied.upper() == drive.upper() else None


def codex_startup_environment():
    """Only two validated Windows path variables required by the MXC launcher."""
    drive = windows_system_drive()
    if not drive:
        raise TaskError('WINDOWS_STARTUP_ENV_INVALID')
    folder_id = ctypes.create_string_buffer(uuid.UUID('f1b32785-6fba-4fcf-9d55-7b8e7f157091').bytes_le)
    folder = ctypes.c_void_p()
    shell = ctypes.WinDLL('shell32')
    shell.SHGetKnownFolderPath.argtypes = [ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    shell.SHGetKnownFolderPath.restype = ctypes.c_long
    try:
        if shell.SHGetKnownFolderPath(folder_id, 0, None, ctypes.byref(folder)) != 0:
            raise TaskError('WINDOWS_STARTUP_ENV_INVALID')
        local = ctypes.wstring_at(folder)
        supplied = os.environ.get('LOCALAPPDATA', '')
        if not supplied or os.path.normcase(os.path.normpath(supplied)) != os.path.normcase(os.path.normpath(local)):
            raise TaskError('WINDOWS_STARTUP_ENV_INVALID')
        return {'SYSTEMDRIVE': drive, 'LOCALAPPDATA': local}
    finally:
        if folder.value:
            ctypes.windll.ole32.CoTaskMemFree.argtypes = [ctypes.c_void_p]
            ctypes.windll.ole32.CoTaskMemFree(folder)


def child_environment():
    # No browser/agent/provider tokens, enrollment secret, auth caches or Git config inheritance.
    allowed = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"}
    env = {k: v for k, v in os.environ.items() if k.upper() in allowed}
    drive = windows_system_drive()
    if drive:
        env['SYSTEMDRIVE'] = drive
    env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "NUL", "GIT_TERMINAL_PROMPT": "0"})
    return env


class Client:
    def __init__(self, base):
        parsed = urllib.parse.urlsplit(base)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise RuntimeError("Only loopback HTTP backend origins are supported")
        self.base = base.rstrip("/")
        self.identity = None
        # Ignore inherited HTTP proxies; never forward credentials through a proxy/redirect.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        self.http = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def ready(self):
        try:
            with self.http.open(self.base + "/actuator/health/readiness", timeout=2) as response:
                return json.load(response).get("status") == "UP"
        except (OSError, ValueError):
            return False

    def post(self, path, body, enrollment=None):
        headers = {"Content-Type": "application/json"}
        if enrollment:
            headers["X-Agent-Enrollment"] = enrollment
        else:
            headers.update({"X-Agent-Id": self.identity["id"], "Authorization": "Agent " + self.identity["credential"]})
        request = urllib.request.Request(self.base + "/api/v2/agent-runtime/" + path, json.dumps(body).encode(), headers)
        with self.http.open(request, timeout=2) as response:
            return json.load(response)

    def get(self, path):
        request = urllib.request.Request(self.base + '/api/v2/agent-runtime/' + path,
            headers={'X-Agent-Id': self.identity['id'], 'Authorization': 'Agent ' + self.identity['credential']})
        with self.http.open(request, timeout=3) as response:
            return json.load(response)


class Executor:
    def __init__(self, root, tick=lambda: None):
        self.root = root
        self.tick = tick
        self.env = child_environment()
        self.git = shutil.which("git.exe")
        self.ffmpeg = os.environ.get("FFMPEG_PATH") or shutil.which("ffmpeg.exe")
        self.current_task = None

    def command(self, argv, cwd, deadline):
        if not argv[0]:
            raise TaskError("TOOL_UNAVAILABLE")
        process = JobProcess(argv, cwd, self.env)
        journal = self.root / "active-process.json"
        try:
            journal.write_text(json.dumps({"pid": process.pid, "taskId": self.current_task}), encoding="utf-8")
            while True:
                if time.monotonic() >= deadline:
                    raise TaskError("TIMEOUT")
                self.tick()
                code = process.poll()
                if code is not None:
                    if code:
                        raise TaskError("PROCESS_FAILED")
                    return
                time.sleep(0.05)
        finally:
            process.close()
            journal.unlink(missing_ok=True)

    def capabilities(self, deadline=None):
        capabilities = ["CAPABILITY_PROBE"]
        for executable, flag, kind in [(self.git, "--version", "GIT_FIXTURE"), (self.ffmpeg, "-version", "FFMPEG_FIXTURE")]:
            try:
                self.command([executable, flag], self.root, min(deadline or float('inf'), time.monotonic() + 5))
                capabilities.append(kind)
            except TaskError as error:
                if str(error) in {"CANCELLED", "LEASE_LOST"} or deadline and time.monotonic() >= deadline:
                    raise
            except OSError:
                pass
        return capabilities

    def execute(self, task):
        # Validate again on the agent: a compromised response cannot supply a command/path.
        if task["kind"] not in KINDS or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,47}", task["worktreeKey"]):
            raise TaskError("AGENT_ERROR")
        task_id = str(uuid.UUID(task["id"]))
        self.current_task = task_id
        attempt = int(task["attempt"])
        if attempt < 1 or not 1 <= task["timeoutSec"] <= 60 or not 1 <= task["durationSec"] <= 30:
            raise TaskError("AGENT_ERROR")
        worktree = self.root / "worktrees" / task["worktreeKey"]
        worktree.mkdir(parents=True, exist_ok=True)
        if worktree.is_symlink() or worktree.is_junction() or not worktree.resolve().is_relative_to(self.root):
            raise TaskError("AGENT_ERROR")
        deadline = time.monotonic() + task["timeoutSec"]
        result = {"exitCode": 0, "artifactSha256": None, "bytes": None, "gitCommit": None,
                  "gitAvailable": None, "ffmpegAvailable": None, "errorCode": None}
        with exclusive_lock(worktree / ".writer.lock"):
            checkpoint = task.get("checkpoint")
            if checkpoint and task["kind"] in {"GIT_FIXTURE", "FFMPEG_FIXTURE"}:
                previous = checkpoint["attempt"]
                saved = checkpoint["result"]
                if isinstance(previous, int) and 0 < previous < attempt:
                    old = worktree / (task_id + "-" + str(previous))
                    artifact = old / ("fixture.txt" if task["kind"] == "GIT_FIXTURE" else "fixture.mp4")
                    if artifact.is_file() and not artifact.is_symlink() and hashlib.sha256(artifact.read_bytes()).hexdigest() == saved.get("artifactSha256"):
                        if task["kind"] != "GIT_FIXTURE" or (old / ".git/refs/heads/fixture").read_text().strip() == saved.get("gitCommit"):
                            print("Restored verified artifact checkpoint from attempt " + str(previous), flush=True)
                            return saved
            directory = worktree / (task_id + "-" + str(attempt))
            directory.mkdir(exist_ok=False)
            if task["kind"] == "GIT_FIXTURE":
                hooks = directory / "disabled-hooks"
                hooks.mkdir()
                prefix = [self.git, "-c", "core.hooksPath=" + str(hooks), "-c", "commit.gpgsign=false"]
                self.command(prefix + ["init", "--initial-branch=fixture", "."], directory, deadline)
                artifact = directory / "fixture.txt"
                artifact.write_text("CreatorFlow isolated Git fixture\n", encoding="utf-8")
                self.command(prefix + ["add", "--", "fixture.txt"], directory, deadline)
                self.command(prefix + ["-c", "user.name=CreatorFlow Fixture", "-c", "user.email=fixture@localhost",
                                       "commit", "-m", "Local fixture"], directory, deadline)
                result["gitCommit"] = (directory / ".git/refs/heads/fixture").read_text().strip()
            elif task["kind"] == "FFMPEG_FIXTURE":
                artifact = directory / "fixture.mp4"
                self.command([self.ffmpeg, "-nostdin", "-v", "error", "-re", "-f", "lavfi", "-i",
                              "color=c=blue:s=64x64:r=10", "-t", str(task["durationSec"]), "-c:v", "mpeg4", str(artifact)], directory, deadline)
                self.command([self.ffmpeg, "-nostdin", "-v", "error", "-i", str(artifact), "-f", "null", "NUL"], directory, deadline)
            else:
                caps = self.capabilities(deadline)
                result.update(gitAvailable="GIT_FIXTURE" in caps, ffmpegAvailable="FFMPEG_FIXTURE" in caps)
                return result
            result.update(artifactSha256=hashlib.sha256(artifact.read_bytes()).hexdigest(), bytes=artifact.stat().st_size)
        return result


def run(args):
    if os.name != "nt":
        raise RuntimeError("This runtime requires Windows")
    root = Path(args.root).absolute()
    root.mkdir(parents=True, exist_ok=True)
    if any(p.is_symlink() or p.is_junction() for p in [root, *root.parents]):
        raise RuntimeError("Agent root must not traverse symlinks/junctions")
    root = root.resolve()
    (root / "worktrees").mkdir(exist_ok=True)
    if (root / "worktrees").is_symlink() or (root / "worktrees").is_junction():
        raise RuntimeError("Invalid worktree root")
    client = Client(args.backend)
    stop = [False]
    signal.signal(signal.SIGINT, lambda *_: stop.__setitem__(0, True))
    signal.signal(signal.SIGTERM, lambda *_: stop.__setitem__(0, True))
    with exclusive_lock(root / "instance.lock"):
        while not stop[0] and not client.ready():
            print("Waiting for local backend readiness", flush=True)
            time.sleep(1)
        if stop[0]:
            return
        credential_file = root / "identity.dpapi"
        if credential_file.exists():
            client.identity = json.loads(protect(credential_file.read_bytes(), decrypt=True))
            if client.identity.get("backend") != client.base:
                raise RuntimeError("Identity belongs to another backend")
        else:
            enrollment = os.environ.get("CREATORFLOW_AGENT_ENROLLMENT_TOKEN", "")
            if len(enrollment) < 32:
                raise RuntimeError("Agent enrollment is not configured")
            from credentials import replace_identity
            import secrets
            bootstrap = root / 'identity-bootstrap.dpapi'
            if bootstrap.exists():
                client.identity = json.loads(protect(bootstrap.read_bytes(), decrypt=True))
                if client.identity.get('backend') != client.base:
                    raise RuntimeError('Bootstrap belongs to another backend')
            else:
                client.identity = dict(id=str(uuid.uuid4()), credential=secrets.token_urlsafe(32), backend=client.base, generation=1)
                replace_identity(bootstrap, client.identity, protect)
            client.post('register', dict(name=args.name, id=client.identity['id'], credentialHash=hashlib.sha256(client.identity['credential'].encode()).hexdigest()), enrollment)
            encrypted = protect(json.dumps(client.identity).encode())
            temporary = root / "identity.dpapi.tmp"
            temporary.write_bytes(encrypted)
            temporary.replace(credential_file)
            bootstrap.unlink(missing_ok=True)
            os.environ.pop('CREATORFLOW_AGENT_ENROLLMENT_TOKEN', None)
        executor = Executor(root)
        from credentials import recover, rotate_if_requested
        recover(client, root, protect)
        capabilities = executor.capabilities()
        from worktrees import WorktreeManager, KINDS as WORKTREE_KINDS
        if os.environ.get('CREATORFLOW_REPOSITORY_ROOTS') and executor.git:
            capabilities += list(WORKTREE_KINDS)
        session = client.post("session", {"capabilities": capabilities})["sessionId"]
        manager = WorktreeManager(root, client, session) if os.environ.get('CREATORFLOW_REPOSITORY_ROOTS') else None
        from codex_executor import ExecutionManager
        coding = ExecutionManager(manager,client,session) if manager else None
        usage_thread = None
        if os.environ.get("CREATORFLOW_USAGE_ENABLED", "true").lower() == "true":
            import threading
            from codex_usage import usage_loop
            usage_thread = threading.Thread(target=usage_loop, args=(client, session, root, stop), daemon=True)
            usage_thread.start()
        print("Agent session started; credentials retained by Windows DPAPI", flush=True)
        last_beat = [0.0]
        current = [None]
        def tick():
            if stop[0]:
                raise TaskError("CANCELLED")
            if time.monotonic() - last_beat[0] < 1:
                return
            try:
                client.post("heartbeat", {"sessionId": session})
                if current[0]:
                    response = client.post("tasks/" + current[0]["id"] + "/renew", {"sessionId": session, "attempt": current[0]["attempt"]})
                    if response["cancelRequested"]:
                        raise TaskError("CANCELLED")
                last_beat[0] = time.monotonic()
            except TaskError:
                raise
            except Exception:
                raise TaskError("LEASE_LOST") from None
        executor.tick = tick
        if manager:
            manager.tick = tick
        last_configuration = 0.0
        while not stop[0]:
            try:
                if time.monotonic() - last_configuration > 10:
                    if rotate_if_requested(client, root, protect):
                        stop[0] = True
                        if usage_thread:
                            usage_thread.join(timeout=30)
                        return 'ROTATED'
                    if manager:
                        manager.sync()
                        from codex_usage import CodexUsageCollector
                        collector = CodexUsageCollector(root / 'usage')
                        version = None
                        if collector.executable:
                            code, output = collector.capture_public(['--version'], 5)
                            match = re.search(r'codex-cli (\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.]+)?)', output)
                            version = match[1] if not code and match else None
                        client.post('coding/capabilities', dict(sessionId=session, providers=[dict(provider='CODEX_CLI', installed=bool(version), version=version), dict(provider='GEMINI_CLI', installed=bool(shutil.which('gemini')), version=None)]))
                        client.post('coding/executions/capability',dict(sessionId=session,**coding.runner.capability()))
                    last_configuration = time.monotonic()
                tick()
                if coding:
                    execution=client.post('coding/executions/claim',dict(sessionId=session))
                    if execution:
                        coding.execute(execution,tick)
                        if args.once:return
                        continue
                task = client.post("claim", {"sessionId": session})
                if not task:
                    time.sleep(0.5)
                    continue
                current[0] = task
                try:
                    if task['kind'] in WORKTREE_KINDS:
                        if not manager:
                            raise TaskError('REPOSITORY_REJECTED')
                        report = manager.execute(task)
                        client.post('coding/tasks/' + task['id'] + '/checkpoint', report)
                        good = report['state'] in ('READY', 'CLEANED')
                        result = dict(exitCode=0 if good else -1, gitCommit=report['headCommit'], errorCode=None if good else 'WORKSPACE_RECONCILIATION_REQUIRED')
                        state = 'SUCCEEDED' if good else 'FAILED'
                    else:
                        result = executor.execute(task)
                        state = "SUCCEEDED"
                except TaskError as error:
                    code = str(error)
                    result = {"exitCode": -1, "errorCode": code}
                    state = "CANCELLED" if code == "CANCELLED" else "FAILED"
                except Exception:
                    result, state = {"exitCode": -1, "errorCode": "AGENT_ERROR"}, "FAILED"
                # On lost lease, never publish an unfenced result. Recovery is owned by PostgreSQL.
                if result.get("errorCode") != "LEASE_LOST":
                    if state == "SUCCEEDED" and task['kind'] not in WORKTREE_KINDS:
                        client.post("tasks/" + task["id"] + "/checkpoint", {"sessionId": session, "attempt": task["attempt"], "result": result})
                    completion = {"sessionId": session, "attempt": task["attempt"], "state": state, "result": result}
                    client.post("tasks/" + task["id"] + "/result", completion)
                observed = "LEASE_LOST; awaiting backend recovery" if result.get("errorCode") == "LEASE_LOST" else state
                print("Task " + task["id"] + " attempt " + str(task["attempt"]) + ": " + observed, flush=True)
                current[0] = None
                if args.once:
                    return
            except Exception:
                # No exception URLs, headers, provider output or secrets enter logs.
                current[0] = None
                print("Backend unavailable or session fenced; retrying safely", flush=True)
                time.sleep(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://127.0.0.1:8080")
    parser.add_argument("--root", default="storage/local-agent")
    parser.add_argument("--name", default="Windows Local Agent")
    parser.add_argument("--once", action="store_true")
    try:
        while run(parser.parse_args()) == 'ROTATED':
            pass
    except Exception:
        print("Agent stopped: check configuration, exclusive root ownership and DPAPI identity", flush=True)
        raise SystemExit(1)
