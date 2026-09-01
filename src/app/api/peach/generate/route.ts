import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  enqueueAnimateJob,
  enqueueClipJob,
  enqueueEditJob,
  enqueueFilmJob,
  enqueuePhotoJob,
  enqueueRegenJob,
} from "@/lib/gallery-jobs";

export const runtime = "nodejs";
export const maxDuration = 900;

const photoSchema = z.object({
  action: z.literal("photo"),
  characterId: z.string().optional().nullable(),
  characterIds: z.array(z.string()).optional(),
  poseId: z.string().optional(),
  styleId: z.string().optional(),
  userNote: z.string().optional(),
  includeMale: z.boolean().optional(),
  clothed: z.boolean().optional(),
  pokies: z.boolean().optional(),
  usePreset: z.boolean().optional(),
  presetId: z.string().optional().nullable(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  title: z.string().optional(),
  composedPrompt: z.string().optional(),
  skinDetail: z.boolean().optional(),
  skinDetailStrength: z.number().min(0).max(3.5).optional(),
  legoQuery: z.string().optional(),
  orientationId: z.string().optional(),
  photoCount: z.number().int().min(1).max(4).optional(),
});

const editSchema = z.object({
  action: z.literal("edit"),
  itemId: z.string(),
  editPrompt: z.string().min(2),
});

const regenSchema = z.object({
  action: z.literal("regen"),
  itemId: z.string(),
});

const clipSchema = z.object({
  action: z.literal("clip"),
  characterId: z.string().optional().nullable(),
  plot: z.string().min(2),
  stillId: z.string().optional(),
  withMusic: z.boolean().optional(),
  durationSec: z.number().int().min(4).max(12).optional(),
  title: z.string().optional(),
  composedPrompt: z.string().optional(),
});

const filmSchema = z.object({
  action: z.literal("film"),
  characterId: z.string().optional().nullable(),
  plot: z.string().min(2),
  sceneCount: z.number().int().min(2).max(4).optional(),
  withMusic: z.boolean().optional(),
  durationSec: z.number().int().min(4).max(12).optional(),
  title: z.string().optional(),
});

const animateSchema = z.object({
  action: z.literal("animate"),
  itemId: z.string(),
  plot: z.string().optional(),
  withMusic: z.boolean().optional(),
  durationSec: z.number().int().min(4).max(12).optional(),
  composedPrompt: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const body = await req.json();
  const action = body?.action as string;

  try {
    if (action === "photo") {
      const data = photoSchema.parse(body);
      const count = data.photoCount ?? 1;
      let lastItem = null;
      for (let i = 0; i < count; i++) {
        lastItem = await enqueuePhotoJob(user.id, {
          userId: user.id,
          ...data,
          title: data.title || (count > 1 ? `Фото ${i + 1}/${count}` : undefined),
          legoQuery: data.legoQuery,
          orientationId: data.orientationId,
        });
      }
      return NextResponse.json({ item: lastItem });
    }
    if (action === "edit") {
      const data = editSchema.parse(body);
      const item = await enqueueEditJob(user.id, data.itemId, data.editPrompt);
      return NextResponse.json({ item });
    }
    if (action === "regen") {
      const data = regenSchema.parse(body);
      const item = await enqueueRegenJob(user.id, data.itemId);
      return NextResponse.json({ item });
    }
    if (action === "clip") {
      const data = clipSchema.parse(body);
      const item = await enqueueClipJob(user.id, { userId: user.id, ...data });
      return NextResponse.json({ item });
    }
    if (action === "film") {
      const data = filmSchema.parse(body);
      const item = await enqueueFilmJob(user.id, { userId: user.id, ...data });
      return NextResponse.json({ item });
    }
    if (action === "animate") {
      const data = animateSchema.parse(body);
      const item = await enqueueAnimateJob(
        user.id,
        data.itemId,
        data.plot?.trim() || "match the still pose",
        data.withMusic,
        data.composedPrompt?.trim() || undefined,
        data.durationSec,
      );
      return NextResponse.json({ item });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
