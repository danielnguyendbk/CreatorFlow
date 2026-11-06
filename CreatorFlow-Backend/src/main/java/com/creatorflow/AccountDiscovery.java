package com.creatorflow;

import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

@Component
class AccountDiscovery {
    record Health(boolean installed, String status, String code) {}

    Health inspect(String provider) {
        if (!List.of("CODEX_CLI", "GEMINI_CLI").contains(provider))
            return new Health(false, "UNKNOWN", "LIVE_HEALTH_NOT_CHECKED");
        String command = provider.equals("CODEX_CLI") ? "codex" : "gemini";
        int installed = run(command, false);
        if (installed == 127) return new Health(false, "UNKNOWN", "CLI_NOT_FOUND");
        if (installed != 0) return new Health(false, "UNKNOWN", "CLI_PROBE_FAILED");
        if (provider.equals("GEMINI_CLI"))
            return new Health(true, "UNKNOWN", "NO_NONINTERACTIVE_AUTH_PROBE");
        int auth = run(command, true);
        return new Health(true, auth == 0 ? "CONNECTED" : "UNKNOWN",
            auth == 0 ? "LOCAL_LOGIN_PRESENT_NOT_LIVE_VERIFIED" : "LOGIN_STATUS_UNCONFIRMED");
    }

    // Fixed allowlist only; discard CLI output so auth messages never enter API/logs/DB.
    private int run(String command, boolean auth) {
        Process process = null;
        try {
            boolean windows = System.getProperty("os.name").toLowerCase().contains("win");
            ProcessBuilder builder;
            if (windows) {
                String script = "$c=Get-Command " + command + ".cmd -CommandType Application -ErrorAction SilentlyContinue; "
                    + "if (!$c) { exit 127 }; & $c.Source " + (auth ? "login status" : "--version") + "; exit $LASTEXITCODE";
                builder = new ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script);
            } else builder = new ProcessBuilder(auth ? List.of(command,"login","status") : List.of(command,"--version"));
            process = builder.redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            if (!process.waitFor(10, TimeUnit.SECONDS)) return -1;
            return process.exitValue();
        } catch (java.io.IOException e) { return 127;
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); return -1;
        } finally {
            if (process != null && process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        }
    }
}
