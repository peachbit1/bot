import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { useComfy, comfyBaseUrl } from "@/lib/metalnode-config";

async function pingComfy(): Promise<boolean> {
  try {
    const res = await fetch(`${comfyBaseUrl()}/system_stats`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Quick prod deploy check — curl /api/tg/version after Railway deploy. */
export async function GET() {
  // Scrub author identity from stored templates (lookbook/LoRA leakage).
  void import("@/lib/tg/migrate-template-identity")
    .then((m) => m.migrateTemplateIdentityHygiene())
    .catch((e) => console.error("[peach] template migrate on version:", e));

  const catalogDir = path.join(process.cwd(), "public", "tg", "catalog");
  const catalogFiles = fs.existsSync(catalogDir)
    ? fs.readdirSync(catalogDir).sort()
    : [];

  const presetNames = [
    "krea_concept_loras.json",
    "prompt_lego.json",
    "prompt_lego_video.json",
    "prompt_presets.json",
  ];
  const presetsDir = path.join(process.cwd(), "presets");
  const presets = Object.fromEntries(
    presetNames.map((name) => [name, fs.existsSync(path.join(presetsDir, name))]),
  );

  const gpu = {
    useComfy: useComfy(),
    comfyUrl: comfyBaseUrl(),
    comfyUp: await pingComfy(),
    forceMock: process.env.COMFY_FORCE_MOCK === "1",
    tunnelConfigured: Boolean(process.env.METALNODE_SSH_KEY?.trim()),
    presetsOk: presetNames.every((name) => presets[name]),
    presets,
  };

  return NextResponse.json({
    build: "tg-ready-v8-miniapp-ux",
    gpu,
    catalogFiles,
    features: {
      studioPhoto: fs.existsSync(
        path.join(process.cwd(), "src", "app", "tg", "studio-photo", "page.tsx"),
      ),
      videoFlow: fs.existsSync(
        path.join(process.cwd(), "src", "app", "tg", "video-flow", "page.tsx"),
      ),
      catalogSeed: fs.existsSync(
        path.join(process.cwd(), "src", "lib", "tg", "tg-catalog-seed.json"),
      ),
    },
  });
}
