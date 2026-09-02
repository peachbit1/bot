/**
 * Railway production: SSH tunnel to GPU Comfy, then Next.js + Telegram bot.
 */
import { spawn } from "node:child_process";
import { ensureComfyTunnel } from "./railway-comfy-tunnel.mjs";

function run(label, cmd, args) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  child.on("exit", (code) => {
    if (code !== 0) console.error(`[railway] ${label} exited with code ${code}`);
  });
  return child;
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
  const bot = run("bot", "npx", ["tsx", "scripts/tg-bot-dev.ts"]);
  const web = run("web", "npm", ["start"]);

  function shutdown(signal) {
    console.log(`[railway] ${signal}, stopping…`);
    bot.kill("SIGTERM");
    web.kill("SIGTERM");
    setTimeout(() => process.exit(0), 2000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  web.on("exit", (code) => {
    if (code !== 0) shutdown(`web exit ${code}`);
  });
}

main().catch((err) => {
  console.error("[railway] fatal:", err);
  process.exit(1);
});
