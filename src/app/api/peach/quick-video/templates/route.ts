import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  createQuickVideoTemplateFromRun,
  listPublishedQuickVideoTemplates,
  type TemplateCategory,
} from "@/lib/quick-video-template";

export const runtime = "nodejs";

const createSchema = z.object({
  sourceRunId: z.string().min(1),
  title: z.string().min(1).max(120),
  notes: z.string().max(500).optional(),
  category: z.enum(["peach", "bitch"]),
  isJuice: z.boolean(),
  priceCredits: z.number().int().min(0).max(500),
});

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const category = req.nextUrl.searchParams.get("category") as
    | TemplateCategory
    | null;
  const templates = await listPublishedQuickVideoTemplates(
    user.id,
    category || undefined,
  );
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  try {
    const body = createSchema.parse(await req.json());
    const template = await createQuickVideoTemplateFromRun({
      userId: user.id,
      sourceRunId: body.sourceRunId,
      title: body.title,
      notes: body.notes,
      category: body.category,
      isJuice: body.isJuice,
      priceCredits: body.priceCredits,
    });
    return NextResponse.json({ template });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
