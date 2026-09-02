import { NextResponse } from "next/server";
import { listStudioCasts } from "@/lib/tg/studio-cast";
import { normalizeLocale } from "@/lib/tg/i18n";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = normalizeLocale(url.searchParams.get("locale"));
  const casts = await listStudioCasts(locale);
  return NextResponse.json({ casts });
}
