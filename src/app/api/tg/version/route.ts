import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/** Quick prod deploy check — curl /api/tg/version after Railway deploy. */
export async function GET() {
  const catalogDir = path.join(process.cwd(), "public", "tg", "catalog");
  const catalogFiles = fs.existsSync(catalogDir)
    ? fs.readdirSync(catalogDir).sort()
    : [];

  return NextResponse.json({
    build: "tg-ready-v2",
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
