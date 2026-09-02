import { prisma } from "@/lib/db";
import { extractFirstFramePng } from "@/lib/ffmpeg-stitch";
import { localPathFromResultUrl, saveGalleryBinary } from "@/lib/local-store";

const TEMPLATE_PREVIEW_PREFIX = "qv_tpl_thumb";

export async function previewPhotoFromVideoFrame(
  userId: string,
  resultVideoUrl: string,
): Promise<string> {
  const videoPath = localPathFromResultUrl(resultVideoUrl);
  if (!videoPath) return "";
  try {
    const frameBytes = await extractFirstFramePng(videoPath);
    const saved = saveGalleryBinary(
      userId,
      "png",
      frameBytes,
      TEMPLATE_PREVIEW_PREFIX,
    );
    return saved.publicUrl;
  } catch {
    return "";
  }
}

export async function ensureTemplatePreviewPhoto(
  row: {
    id: string;
    userId: string;
    previewVideoUrl: string;
    previewPhotoUrl: string;
  },
): Promise<string> {
  if (!row.previewVideoUrl) return row.previewPhotoUrl;
  if (row.previewPhotoUrl.includes(TEMPLATE_PREVIEW_PREFIX)) {
    return row.previewPhotoUrl;
  }
  const previewPhotoUrl = await previewPhotoFromVideoFrame(
    row.userId,
    row.previewVideoUrl,
  );
  if (!previewPhotoUrl) return row.previewPhotoUrl;
  await prisma.quickVideoTemplate.update({
    where: { id: row.id },
    data: { previewPhotoUrl },
  });
  return previewPhotoUrl;
}
