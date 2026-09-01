/**
 * Keep Comfy :8188 alive during a testing session.
 * Restarts paramiko tunnel if system_stats fails twice in a row.
 *
 *   node scripts/comfy-tunnel-watchdog.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STARTER = path.join(ROOT, "scripts", "start-comfy-tunnel-detached.mjs");
const TICK_MS = 15_000;
const FAIL_BEFORE_RESTART = 2;

function pingComfy(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.get(
      "http://127.0.0.1:8188/system_stats",
      { timeout: timeoutMs },
      (res) => {
        res.resume();
        const code = res.statusCode || 0;
        resolve(code >= 200 && code < 500);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function restartTunnel() {
  console.log(`[watchdog] ${new Date().toISOString()} comfy down → restart tunnel`);
  const child = spawn(process.execPath, [STARTER], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

let fails = 0;
console.log(`[watchdog] started, tick=${TICK_MS}ms`);

setInterval(async () => {
  const ok = await pingComfy();
  if (ok) {
    if (fails > 0) console.log(`[watchdog] ${new Date().toISOString()} comfy OK again`);
    fails = 0;
    return;
  }
  fails += 1;
  console.log(`[watchdog] ${new Date().toISOString()} comfy ping fail (${fails})`);
  if (fails >= FAIL_BEFORE_RESTART) {
    restartTunnel();
    fails = 0;
  }
}, TICK_MS);
