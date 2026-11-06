"""Read-only Codex App Server collector. Never opens provider credential files.

Only initialize/initialized and schema-declared account rate-limit/usage reads are
sent. No login, thread, turn, exec, reset-credit redemption or account switching.
"""
import datetime as dt
import json
import os
from pathlib import Path
import queue
import re
import shutil
import threading
import time
import uuid
from windows_process import JobProcess


class CollectorError(Exception):
    def __init__(self, code):
        self.code = code


def resolve_codex():
    direct = shutil.which("codex.exe")
    if direct:
        return direct
    wrapper = shutil.which("codex.cmd")
    if not wrapper:
        return None
    root = Path(wrapper).parent / "node_modules/@openai/codex/node_modules/@openai"
    # Fixed official npm platform layout only; never parse command text or auth profiles.
    for platform, triple in [("codex-win32-x64", "x86_64-pc-windows-msvc"), ("codex-win32-arm64", "aarch64-pc-windows-msvc")]:
        executable = root / platform / "vendor" / triple / "bin/codex.exe"
        if executable.is_file():
            return str(executable)
    return None


class Channel:
    def __init__(self, process, deadline):
        self.process, self.deadline = process, deadline
        self.messages = queue.Queue(maxsize=256)
        def read():
            try:
                for line in process.stdout:
                    if len(line) > 1_000_000:
                        break
                    try:
                        message = json.loads(line)
                    except ValueError:
                        continue
                    try:
                        self.messages.put_nowait(message)
                    except queue.Full:
                        break
            except (OSError, ValueError):
                pass
        self.reader = threading.Thread(target=read, daemon=True)
        self.reader.start()
        self.serial = 0
        self.latest_limits = None

    def send(self, message):
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()

    def call(self, method, params=None):
        self.serial += 1
        id = self.serial
        message = {"id": id, "method": method}
        if params is not None:
            message["params"] = params
        self.send(message)
        while True:
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise CollectorError("COLLECTOR_TIMEOUT")
            try:
                response = self.messages.get(timeout=min(remaining, 0.1))
            except queue.Empty:
                if self.process.poll() is not None:
                    raise CollectorError("PROTOCOL_UNSUPPORTED")
                continue
            if not isinstance(response, dict):
                continue
            if response.get("id") == id and "method" not in response:
                if "error" in response:
                    code = response["error"].get("code")
                    if code == -32601:
                        raise CollectorError("PROTOCOL_UNSUPPORTED")
                    # Error text is examined transiently for auth classification, never retained/logged.
                    text = str(response["error"].get("message", "")).lower()
                    if any(word in text for word in ("not logged", "not signed", "unauthorized", "authentication", "401", "sign in", "chatgpt auth")):
                        raise CollectorError("NOT_AUTHENTICATED")
                    raise CollectorError("PROVIDER_ERROR")
                if method == "account/rateLimits/read":
                    self.latest_limits = None
                return response.get("result", {})
            if "method" in response and "id" in response:
                self.send({"id": response["id"], "error": {"code": -32601, "message": "Read-only collector does not provide this method"}})
            if response.get("method") == "account/rateLimits/updated" and isinstance(response.get("params"), dict):
                self.latest_limits = response["params"]


def normalize(rate, usage=None):
    if not isinstance(rate, dict):
        raise CollectorError("SCHEMA_INVALID")
    bucket = rate.get("rateLimitsByLimitId", {}).get("codex") if isinstance(rate.get("rateLimitsByLimitId"), dict) else None
    bucket = bucket or rate.get("rateLimits") or {}
    if not isinstance(bucket, dict):
        raise CollectorError("SCHEMA_INVALID")
    windows = []
    for key in ("primary", "secondary"):
        window = bucket.get(key)
        if window is None:
            continue
        if not isinstance(window, dict):
            raise CollectorError("SCHEMA_INVALID")
        minutes, used, resets = window.get("windowDurationMins"), window.get("usedPercent"), window.get("resetsAt")
        if minutes is None:
            continue
        if type(minutes) is not int or not 0 < minutes <= 525600 or type(used) not in (int, float) or not 0 <= used <= 100:
            raise CollectorError("SCHEMA_INVALID")
        if resets is not None and (type(resets) is not int or not 0 <= resets <= 253402300799):
            raise CollectorError("SCHEMA_INVALID")
        windows.append(dict(windowDurationMins=minutes, usedPercent=used, resetsAt=resets))
    credits = None
    raw = bucket.get("credits")
    if isinstance(raw, dict):
        balance = raw.get("balance")
        credits = {"balance": balance if isinstance(balance, str) and re.fullmatch(r"[0-9]{1,30}(\.[0-9]{1,10})?", balance) else None,
                   "hasCredits": raw.get("hasCredits") if type(raw.get("hasCredits")) is bool else None,
                   "unlimited": raw.get("unlimited") if type(raw.get("unlimited")) is bool else None}
    tokens = None
    if isinstance(usage, dict) and isinstance(usage.get("summary"), dict):
        tokens = {key: value if type(value := usage["summary"].get(key)) is int and value >= 0 else None for key in ("lifetimeTokens", "peakDailyTokens")}
    reached = bucket.get("rateLimitReachedType")
    known = {"rate_limit_reached", "workspace_owner_credits_depleted", "workspace_member_credits_depleted", "workspace_owner_usage_limit_reached", "workspace_member_usage_limit_reached"}
    return dict(status="OK" if windows else "NO_DATA", windows=windows, credits=credits, tokens=tokens,
                rateLimitReached=True if reached in known else None, errorCode=None if windows else "NO_RATE_LIMIT_DATA")


class CodexUsageCollector:
    def __init__(self, root, timeout=20):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.timeout = timeout
        self.executable = resolve_codex()

    def capture_public(self, args, timeout):
        allowed = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "PATHEXT"}
        env = {k: v for k, v in os.environ.items() if k.upper() in allowed}
        process = JobProcess([self.executable, *args], self.root, env, piped=True)
        output = []
        def read():
            try:
                output.append(process.stdout.read(65536))
            except (OSError, ValueError):
                pass
        reader = threading.Thread(target=read, daemon=True)
        reader.start()
        try:
            deadline = time.monotonic() + timeout
            while process.poll() is None:
                if time.monotonic() >= deadline:
                    raise CollectorError("COLLECTOR_TIMEOUT")
                time.sleep(0.02)
            reader.join(timeout=1)
            return process.poll(), "".join(output)
        finally:
            process.close()

    def collect(self, sequence):
        snapshot = dict(id=str(uuid.uuid4()), sequence=sequence, observedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                        cliVersion=None, status="ERROR", windows=[], rateLimitReached=None, credits=None, tokens=None, errorCode="PROVIDER_ERROR")
        try:
            if not self.executable:
                raise CollectorError("CLI_NOT_FOUND")
            # --version and generated schema are public, non-inference commands.
            code, version = self.capture_public(["--version"], 5)
            match = re.search(r"codex-cli (\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.]+)?)", version)
            if code or not match:
                raise CollectorError("PROTOCOL_UNSUPPORTED")
            snapshot["cliVersion"] = match[1]
            schema_dir = self.root / ("schema-" + match[1])
            if not (schema_dir / "ClientRequest.json").exists():
                code, _ = self.capture_public(["app-server", "generate-json-schema", "--experimental", "--out", str(schema_dir)], 10)
                if code:
                    raise CollectorError("PROTOCOL_UNSUPPORTED")
            request_schema = json.loads((schema_dir / "ClientRequest.json").read_text(encoding="utf-8"))
            methods = {name for variant in request_schema.get("oneOf", []) for name in variant.get("properties", {}).get("method", {}).get("enum", [])}
            if not {"initialize", "account/rateLimits/read"} <= methods:
                raise CollectorError("PROTOCOL_UNSUPPORTED")
            init_schema = json.loads((schema_dir / "v1/InitializeParams.json").read_text(encoding="utf-8"))
            declared = init_schema.get("definitions", {}).get("InitializeCapabilities", {}).get("properties", {})
            capabilities = {"experimentalApi": True}
            if "explicitGatewayOauth" in declared:
                capabilities["explicitGatewayOauth"] = True
            # Preserve normal provider-owned auth resolution; remove CreatorFlow credentials entirely.
            rpc_env = {k: v for k, v in os.environ.items() if not k.upper().startswith("CREATORFLOW_") and not k.upper().startswith("DB_")}
            process = JobProcess([self.executable, "app-server", "--stdio"], self.root, rpc_env, piped=True)
            try:
                channel = Channel(process, time.monotonic() + self.timeout)
                channel.call("initialize", {"clientInfo": {"name": "creatorflow_usage", "version": "0.1.0"}, "capabilities": capabilities})
                channel.send({"method": "initialized", "params": {}})
                limits = channel.call("account/rateLimits/read")
                usage = None
                if "account/usage/read" in methods:
                    try:
                        usage = channel.call("account/usage/read")
                    except CollectorError as error:
                        # Token activity is optional; a failure must not erase a valid quota read.
                        usage = None
                if channel.latest_limits:
                    # Apply only explicitly updated fields; omitted windows remain from the read.
                    for key in ("rateLimits", "rateLimitsByLimitId"):
                        update = channel.latest_limits.get(key)
                        if isinstance(update, dict):
                            base = limits.setdefault(key, {})
                            for name, value in update.items():
                                if isinstance(value, dict) and isinstance(base.get(name), dict):
                                    base[name].update(value)
                                else:
                                    base[name] = value
                snapshot.update(normalize(limits, usage))
            finally:
                process.close()
        except CollectorError as error:
            status = {"CLI_NOT_FOUND": "CLI_NOT_FOUND", "PROTOCOL_UNSUPPORTED": "UNSUPPORTED", "NOT_AUTHENTICATED": "NOT_AUTHENTICATED", "COLLECTOR_TIMEOUT": "TIMEOUT"}.get(error.code, "ERROR")
            snapshot.update(status=status, errorCode=error.code)
        except TimeoutError:
            snapshot.update(status="TIMEOUT", errorCode="COLLECTOR_TIMEOUT")
        except Exception as error:
            import subprocess
            if isinstance(error, subprocess.TimeoutExpired):
                snapshot.update(status="TIMEOUT", errorCode="COLLECTOR_TIMEOUT")
            else:
                snapshot.update(status="ERROR", errorCode="PROVIDER_ERROR")
        snapshot["observedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        return snapshot


def usage_loop(client, session, root, stop):
    collector = CodexUsageCollector(Path(root) / "usage")
    next_collection, pending = 0.0, None
    while not stop[0]:
        try:
            instructions = client.post("usage/poll", {"sessionId": session})
            if pending is not None:
                client.post("usage/snapshot?sessionId=" + session, pending)
                pending = None
                instructions = client.post("usage/poll", {"sessionId": session})
            if time.monotonic() >= next_collection or instructions["refreshRequested"]:
                pending = collector.collect(instructions["sequence"] + 1)
                client.post("usage/snapshot?sessionId=" + session, pending)
                pending = None
                next_collection = time.monotonic() + instructions["pollIntervalSeconds"]
        except Exception:
            # Retain one sanitized payload for idempotent retransmission; never log RPC errors.
            pass
        for _ in range(25):
            if stop[0]:
                return
            time.sleep(0.2)
