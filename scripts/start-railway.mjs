/**
 * Railway production: SSH tunnel to GPU Comfy, then Next.js + Telegram bot.
 * Web OOM must not kill the bot — restart Next separately.
 */
import { spawn } from "node:child_process";
import { ensureComfyTunnel } from "./railway-comfy-tunnel.mjs";

/** @type {Map<string, import("node:child_process").ChildProcess>} */
const children = new Map();
let shuttingDown = false;

function run(label, cmd, args, envExtra = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...envExtra },
  });
  children.set(label, child);
  child.on("exit", (code) => {
    children.delete(label);
    if (code !== 0) console.error(`[railway] ${label} exited with code ${code}`);
  });
  return child;
}

function startBot() {
  // Keep bot lean; leave RAM for Next mini-app.
  return run("bot", "npx", ["tsx", "scripts/tg-bot-dev.ts"], {
    NODE_OPTIONS: "--max-old-space-size=256",
  });
}

function startWeb() {
  // Prefer Railway NODE_OPTIONS; default high enough for Next 16 + mini-app.
  const fromEnv = String(process.env.NODE_OPTIONS || "").trim();
  const nodeOpts = /\bmax-old-space-size=/.test(fromEnv)
    ? fromEnv
    : `${fromEnv} --max-old-space-size=1536`.trim();
  return run("web", "npm", ["start"], { NODE_OPTIONS: nodeOpts });
}

function restartWeb(delayMs = 2500) {
  if (shuttingDown) return;
  console.log(`[railway] restarting web in ${delayMs}ms…`);
  setTimeout(() => {
    if (shuttingDown) return;
    if (children.has("web")) return;
    startWeb();
    watchWeb();
  }, delayMs);
}

function watchWeb() {
  const web = children.get("web");
  if (!web) return;
  web.on("exit", (code) => {
    if (shuttingDown) return;
    console.error(`[railway] web exit ${code ?? "?"} — bot stays up, restarting web`);
    restartWeb();
  });
}

function watchBot() {
  const bot = children.get("bot");
  if (!bot) return;
  bot.on("exit", (code) => {
    if (shuttingDown) return;
    console.error(`[railway] bot exit ${code ?? "?"} — restarting bot`);
    setTimeout(() => {
      if (shuttingDown || children.has("bot")) return;
      startBot();
      watchBot();
    }, 2000);
  });
}

async function main() {
  try {
    const tunnel = await ensureComfyTunnel();
    if (tunnel.ok) {
      console.log(`[railway] GPU Comfy ready (${tunnel.reason})`);
    } else {
      console.log("[railway] running without GPU tunnel (mock mode)");
    }
  } catch (err) {
    console.error("[railway] GPU tunnel failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("[railway] starting web + bot…");

  run("bootstrap", "npx", ["tsx", "scripts/seed-tg-catalog.ts"]);
  startBot();
  startWeb();
  watchBot();
  watchWeb();

  function shutdown(signal) {
    shuttingDown = true;
    console.log(`[railway] ${signal}, stopping…`);
    for (const child of children.values()) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => process.exit(0), 2000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[railway] fatal:", err);
  process.exit(1);
});
