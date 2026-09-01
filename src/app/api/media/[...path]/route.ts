import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveGalleryFile } from "@/lib/local-store";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const parts = (await ctx.params).path || [];
  const relKey = parts.join("/");
  const abs = resolveGalleryFile(relKey);
  if (!abs) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
