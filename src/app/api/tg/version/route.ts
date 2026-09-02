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
  const catalogDir = path.join(process.cwd(), "public", "tg", "catalog");
  const catalogFiles = fs.existsSync(catalogDir)
    ? fs.readdirSync(catalogDir).sort()
    : [];

  const gpu = {
    useComfy: useComfy(),
    comfyUrl: comfyBaseUrl(),
    comfyUp: await pingComfy(),
    forceMock: process.env.COMFY_FORCE_MOCK === "1",
    tunnelConfigured: Boolean(process.env.METALNODE_SSH_KEY?.trim()),
    presetsOk: fs.existsSync(
      path.join(process.cwd(), "presets", "krea_concept_loras.json"),
    ),
  };

  return NextResponse.json({
    build: "tg-ready-v3-gpu",
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
