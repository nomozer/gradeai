const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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
