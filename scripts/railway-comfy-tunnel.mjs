/**
 * SSH tunnel to Metalnode Comfy for Railway production.
 * Same idea as npm run tunnel — forwards localhost:8188 to GPU Comfy.
 *
 * Env:
 *   METALNODE_SSH_KEY   — private key (multiline or \n escaped)
 *   METALNODE_HOST      — default 77.94.203.13
 *   METALNODE_SSH_PORT  — default 22024
 *   METALNODE_SSH_USER  — default root
 *   COMFY_URL           — default http://127.0.0.1:8188
 */
import fs from "node:fs";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";

const KEY_PATH = process.env.METALNODE_SSH_KEY_PATH || "/tmp/metalnode_ssh_key";
const HOST = process.env.METALNODE_HOST || "77.94.203.13";
const SSH_PORT = String(process.env.METALNODE_SSH_PORT || "22024");
const SSH_USER = process.env.METALNODE_SSH_USER || "root";
const LOCAL_PORT = String(process.env.COMFY_LOCAL_PORT || "8188");
const COMFY_BASE = (process.env.COMFY_URL || `http://127.0.0.1:${LOCAL_PORT}`).replace(
  /\/$/,
  "",
);
const KEEPALIVE = "while true; do echo k; sleep 2; done";

/** @type {import("node:child_process").ChildProcess | null} */
let tunnelProc = null;

function log(msg) {
  console.log(`[railway-tunnel] ${msg}`);
}

function gpuModeEnabled() {
  return process.env.COMFY_FORCE_MOCK !== "1" && process.env.PEACH_USE_COMFY !== "0";
}

function pingComfy(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.get(`${COMFY_BASE}/system_stats`, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function writeKey(raw) {
  const key = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  fs.writeFileSync(KEY_PATH, key.endsWith("\n") ? key : `${key}\n`, { mode: 0o600 });
}

function startTunnel() {
  if (tunnelProc && !tunnelProc.killed) return tunnelProc;

  const args = [
    "-i",
    KEY_PATH,
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=4",
    "-o",
    "ExitOnForwardFailure=yes",
    "-L",
    `127.0.0.1:${LOCAL_PORT}:127.0.0.1:8188`,
    "-p",
    SSH_PORT,
    `${SSH_USER}@${HOST}`,
    KEEPALIVE,
  ];

  tunnelProc = spawn("ssh", args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  tunnelProc.stdout?.on("data", () => {});
  tunnelProc.stderr?.on("data", (buf) => {
    const line = String(buf).trim();
    if (line) log(`ssh: ${line}`);
  });
  tunnelProc.on("exit", (code) => {
    log(`ssh exited ${code ?? "?"}`);
    tunnelProc = null;
  });

  return tunnelProc;
}

function sshBaseArgs() {
  const key = KEY_PATH;
  if (!key) return [];
  return [
    "-i",
    key,
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=25`,
    "-p",
    SSH_PORT,
    `${SSH_USER}@${HOST}`,
  ];
}

async function ensureRemoteComfyUp() {
  // In practice, comfyUp=false means ComfyUI on GPU host is down.
  // This tries to start it once via SSH, then we establish the local tunnel.
  const remote = `
set +e
if curl -sf -m 3 http://127.0.0.1:8188/system_stats >/dev/null; then
  echo COMFY_OK
  exit 0
fi

echo COMFY_DOWN — starting
cd /work/ComfyUI 2>/dev/null || cd /work 2>/dev/null || true

NOHUP_CMD="/work/ai/venv/bin/python main.py --listen --port 8188 --enable-manager"
if [ -f /work/ai/venv/bin/python ]; then
  nohup $NOHUP_CMD >> /work/ComfyUI/user/comfyui_8188.log 2>&1 &
else
  nohup python3 main.py --listen --port 8188 --enable-manager >> /work/ComfyUI/user/comfyui_8188.log 2>&1 &
fi

for i in $(seq 1 25); do
  sleep 1
  if curl -sf -m 3 http://127.0.0.1:8188/system_stats >/dev/null; then
    echo COMFY_UP
    exit 0
  fi
done

echo COMFY_FAIL
exit 1
`;

  const r = spawnSync("ssh", [...sshBaseArgs(), remote], {
    encoding: "utf8",
    timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const out = String(r.stdout || "").trim().split("\n").slice(-5).join(" | ");
  const err = String(r.stderr || "").trim().split("\n").slice(-3).join(" | ");
  if (out) log(`remote comfy: ${out}`);
  if (r.status !== 0 && err) log(`remote comfy err: ${err}`);
  return r.status === 0;
}

export async function ensureComfyTunnel() {
  if (!gpuModeEnabled()) {
    log("GPU disabled (COMFY_FORCE_MOCK or PEACH_USE_COMFY=0) — skip tunnel");
    return { ok: false, reason: "disabled" };
  }

  if (await pingComfy()) {
    log(`Comfy already reachable at ${COMFY_BASE}`);
    return { ok: true, reason: "already_up" };
  }

  // If tunnel-local health fails, also try to bring ComfyUI up on GPU host.
  // This prevents comfyUp from staying false after a remote restart.
  const key = process.env.METALNODE_SSH_KEY?.trim();
  if (!key) {
    throw new Error(
      "PEACH_USE_COMFY=1 but METALNODE_SSH_KEY is missing — cannot reach GPU Comfy",
    );
  }

  writeKey(key);

  if (!process.env.COMFY_SKIP_REMOTE_START) {
    try {
      await ensureRemoteComfyUp();
    } catch (e) {
      log(
        `remote comfy start failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  log(`starting SSH tunnel -> ${HOST}:${SSH_PORT} (local :${LOCAL_PORT})`);
  startTunnel();

  // Fail soft and fast so web/bot can boot; starter retries in background.
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await pingComfy()) {
      log("COMFY_OK");
      return { ok: true, reason: "tunnel" };
    }
    if (!tunnelProc || tunnelProc.killed || tunnelProc.exitCode != null) {
      log("ssh process died early — abort wait");
      break;
    }
  }

  log(`Comfy not reachable at ${COMFY_BASE} after SSH tunnel`);
  return { ok: false, reason: "unreachable" };
}

export async function pingComfyHealth() {
  const up = await pingComfy(3000);
  return { url: COMFY_BASE, up, gpuMode: gpuModeEnabled() };
}
