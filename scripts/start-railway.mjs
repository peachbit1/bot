/**
 * Railway production: Next.js + Telegram bot in one service.
 */
import { spawn } from "node:child_process";

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

console.log("[railway] starting web + bot…");

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
