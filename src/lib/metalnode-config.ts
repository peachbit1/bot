import fs from "fs";
import path from "path";

export type MetalnodeConfig = {
  host: string;
  sshPort: number;
  sshUser: string;
  sshKeyPath: string;
  comfyUrl: string;
  ollamaUrl?: string;
  /** Separate LLM node (second GPU) — Ollama stays loaded, no VRAM unload before Comfy */
  llmHost?: string;
  llmSshPort?: number;
  llmSshKeyPath?: string;
  llmOllamaUrl?: string;
  ollamaRemote?: boolean;
  tunnels?: number[];
  notes?: string;
};

const DEFAULTS: MetalnodeConfig = {
  host: "77.94.203.13",
  sshPort: 22024,
  sshUser: "root",
  sshKeyPath: String.raw`C:\Users\Public\metalnode.key`,
  comfyUrl: "http://127.0.0.1:8188",
  ollamaUrl: "http://127.0.0.1:11434",
  tunnels: [8188],
};

export function loadMetalnodeConfig(): MetalnodeConfig {
  const p = path.join(process.cwd(), "infra", "metalnode.local.json");
  let cfg = DEFAULTS;
  if (fs.existsSync(p)) {
    try {
      cfg = { ...DEFAULTS, ...(JSON.parse(fs.readFileSync(p, "utf-8")) as MetalnodeConfig) };
    } catch {
      cfg = DEFAULTS;
    }
  }
  const llmPath = path.join(process.cwd(), "infra", "metalnode.llm.json");
  if (fs.existsSync(llmPath)) {
    try {
      const llm = JSON.parse(fs.readFileSync(llmPath, "utf-8")) as Partial<MetalnodeConfig>;
      cfg = { ...cfg, ...llm, ollamaRemote: true };
    } catch {
      /* ignore */
    }
  }
  return cfg;
}

/** True when Ollama runs on a different machine — skip VRAM unload before Comfy. */
export function ollamaIsRemote(): boolean {
  if (process.env.OLLAMA_REMOTE === "1") return true;
  const cfg = loadMetalnodeConfig();
  if (cfg.ollamaRemote) return true;
  if (cfg.llmSshPort && Number(cfg.llmSshPort) !== Number(cfg.sshPort)) return true;
  if (cfg.llmHost && cfg.llmHost !== cfg.host) return true;
  return false;
}

export function comfyBaseUrl(): string {
  return (process.env.COMFY_URL || loadMetalnodeConfig().comfyUrl).replace(/\/$/, "");
}

export function useComfy(): boolean {
  if (process.env.COMFY_FORCE_MOCK === "1") return false;
  return process.env.PEACH_USE_COMFY !== "0";
}
