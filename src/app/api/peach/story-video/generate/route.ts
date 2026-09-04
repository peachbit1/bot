import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { startQuickVideoRun } from "@/lib/quick-video";
import {
  MAX_QUICK_VIDEO_PICTURES,
  type QuickVideoSlotRole,
} from "@/lib/quick-video-prompt";
import { videoOrientationSchema } from "@/lib/video-orientation";
import { storyH3LooksStructured } from "@/lib/story-h3-prompt";

export const runtime = "nodejs";
export const maxDuration = 900;

const ROLES = new Set<QuickVideoSlotRole>([
  "identity",
  "location",
  "pose",
  "object",
  "anatomy",
  "other",
]);

function extFromName(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "png";
}

function parseIds(raw: FormDataEntryValue | string | null): string[] {
  if (!raw) return [];
  const text = typeof raw === "string" ? raw : String(raw);
  if (!text.trim()) return [];
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) return j.filter((x) => typeof x === "string");
  } catch {
    /* fall through */
  }
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSlotMeta(raw: FormDataEntryValue | null): Array<{
  pictureIndex: number;
  role: QuickVideoSlotRole;
  label?: string;
  characterName?: string;
}> {
  if (!raw) return [];
  try {
    const j = JSON.parse(String(raw));
    if (!Array.isArray(j)) return [];
    return j
      .map((row) => {
        const pictureIndex = Number(row?.pictureIndex);
        const roleRaw = String(row?.role || "other") as QuickVideoSlotRole;
        const role = ROLES.has(roleRaw) ? roleRaw : "other";
        if (!Number.isFinite(pictureIndex) || pictureIndex < 1) return null;
        return {
          pictureIndex: Math.min(MAX_QUICK_VIDEO_PICTURES, Math.floor(pictureIndex)),
          role,
          label: typeof row?.label === "string" ? row.label.slice(0, 120) : undefined,
          characterName:
            typeof row?.characterName === "string"
              ? row.characterName.slice(0, 80)
              : undefined,
        };
      })
      .filter(Boolean) as Array<{
      pictureIndex: number;
      role: QuickVideoSlotRole;
      label?: string;
      characterName?: string;
    }>;
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  try {
    const form = await req.formData();
    const title = String(form.get("title") || "").slice(0, 120);
    const prompt = String(form.get("prompt") || "").trim();
    if (prompt.length < 80) {
      return NextResponse.json(
        { error: "Вставь полный H3-промпт от Grok (слишком короткий)" },
        { status: 400 },
      );
    }
    if (prompt.length > 24000) {
      return NextResponse.json(
        { error: "Промпт слишком длинный (макс ~24k символов)" },
        { status: 400 },
      );
    }

    const orientationRaw = String(form.get("orientation") || "9_16");
    const orientationParsed = videoOrientationSchema.safeParse(orientationRaw);
    const orientation = orientationParsed.success ? orientationParsed.data : "9_16";
    const durationSec = Math.min(12, Math.max(4, Number(form.get("durationSec") || 8)));
    const characterIds = parseIds(form.get("characterIds"));
    const slotMeta = parseSlotMeta(form.get("slotMeta"));

    const manualSlots: Array<{
      pictureIndex: number;
      role: QuickVideoSlotRole;
      label?: string;
      characterName?: string;
      bytes: Buffer;
      ext?: string;
    }> = [];

    for (let i = 1; i <= MAX_QUICK_VIDEO_PICTURES; i++) {
      const file = form.get(`picture_${i}`);
      if (!(file instanceof File) || file.size <= 0) continue;
      const meta =
        slotMeta.find((m) => m.pictureIndex === i) ||
        ({
          pictureIndex: i,
          role: (i <= 3 ? "identity" : i === 4 ? "location" : "other") as QuickVideoSlotRole,
        });
      manualSlots.push({
        pictureIndex: i,
        role: meta.role,
        label: meta.label,
        characterName: meta.characterName,
        bytes: Buffer.from(await file.arrayBuffer()),
        ext: extFromName(file.name || "ref.png"),
      });
    }

    const poseFile = form.get("poseVideo");
    let poseVideoBuffer: Buffer | null = null;
    let poseVideoName: string | undefined;
    if (poseFile instanceof File && poseFile.size > 0) {
      poseVideoBuffer = Buffer.from(await poseFile.arrayBuffer());
      poseVideoName = poseFile.name || "pose.mp4";
    }

    if (!characterIds.length && !manualSlots.some((s) => s.role === "identity")) {
      return NextResponse.json(
        {
          error:
            "Нужна личность: выбери персонажа или загрузи Photo 1–3 (identity)",
        },
        { status: 400 },
      );
    }

    const run = await startQuickVideoRun({
      userId: user.id,
      title: title || "Story H3",
      prompt,
      storyH3: true,
      characterIds,
      manualSlots,
      poseVideoBuffer,
      poseVideoName,
      orientation,
      durationSec,
    });

    return NextResponse.json({
      ok: true,
      run,
      structured: storyH3LooksStructured(prompt),
      warning: storyH3LooksStructured(prompt)
        ? undefined
        : "Промпт не похож на 6 секций H3 — лучше вставить полный вывод Grok.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
