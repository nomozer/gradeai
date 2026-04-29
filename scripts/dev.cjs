const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");
const isWin = process.platform === "win32";

function cleanEnv(extra = {}) {
  const merged = { ...process.env, ...extra };
  const env = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value == null) continue;
    env[key] = String(value);
  }
  return env;
}

function firstExisting(paths) {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function sleep(ms) {
  const buf = new SharedArrayBuffer(4);
  const view = new Int32Array(buf);
  Atomics.wait(view, 0, 0, ms);
}

function listeningPidsOnPort(port) {
  const wanted = String(port);
  if (isWin) {
    const result = spawnSync("netstat", ["-ano"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const out = `${result.stdout || ""}\n${result.stderr || ""}`;
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const localAddr = parts[1];
      const portSep = localAddr.lastIndexOf(":");
      if (portSep < 0) continue;
      const portPart = localAddr.slice(portSep + 1);
      if (portPart !== wanted) continue;
      const pid = Number(parts[parts.length - 1]);
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
        pids.add(pid);
      }
    }
    return [...pids];
  }

  const result = spawnSync("lsof", [`-tiTCP:${wanted}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return String(result.stdout || "")
    .split(/\s+/)
    .map((x) => Number(x))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

function killPidTree(pid) {
  if (isWin) {
    return spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may have exited between discovery and cleanup.
  }
  return null;
}

function reclaimPort(label, port) {
  if (process.env.HITL_RECLAIM_PORTS === "0") return;
  const pids = listeningPidsOnPort(port);
  if (!pids.length) return;
  console.log(
    `[dev] Reclaiming ${label} port ${port} from stale listener PID(s): ${pids.join(", ")}`,
  );
  for (const pid of pids) {
    killPidTree(pid);
  }
  sleep(700);
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (isWin) {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  child.kill("SIGTERM");
}

function startService(name, command, args, options = {}) {
  console.log(`[dev] Starting ${name}: ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    stdio: "inherit",
    windowsHide: false,
    ...options,
  });
  child.on("error", (err) => {
    console.error(`[dev] ${name} failed to start: ${err.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason =
      signal ? `signal ${signal}` : `exit code ${code == null ? "unknown" : code}`;
    console.log(`[dev] ${name} stopped (${reason}). Shutting down the other service.`);
    shutdown(code ?? 0);
  });
  children.push(child);
  return child;
}

function startFrontend() {
  if (isWin) {
    return startService(
      "frontend",
      "cmd.exe",
      ["/d", "/s", "/c", "npm run dev"],
      {
        cwd: frontendDir,
        env: cleanEnv(),
      },
    );
  }
  return startService("frontend", "npm", ["run", "dev"], {
    cwd: frontendDir,
    env: cleanEnv(),
  });
}

const backendPython =
  firstExisting([
    path.join(backendDir, "venv", isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python"),
    path.join(backendDir, ".venv", isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python"),
  ]) || (isWin ? "python" : "python3");

const children = [];
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    killTree(child);
  }
  setTimeout(() => process.exit(exitCode), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[dev] Frontend: http://localhost:3000");
console.log("[dev] Backend : http://localhost:8000");

reclaimPort("backend", 8000);
reclaimPort("frontend", 3000);

startService(
  "backend",
  backendPython,
  ["-m", "uvicorn", "main:app", "--reload", "--port", "8000"],
  {
    cwd: backendDir,
    env: cleanEnv({
      DEV_MODE: "1",
      PYTHONIOENCODING: "utf-8",
    }),
  },
);

startFrontend();
