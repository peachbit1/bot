import { loadPromptTemplates } from "@/lib/prompt-templates";
import { loadLegoFile } from "@/lib/prompt-lego";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PhotoLabForm } from "@/components/photo-lab-form";

export default async function PeachPhotoPage() {
  const user = await requireUser();
  if (!user) return null;

  const [characters, templates, lego] = await Promise.all([
    prisma.character.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    }),
    Promise.resolve(loadPromptTemplates()),
    Promise.resolve(loadLegoFile()),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Фото</h2>
        <p className="text-sm text-zinc-500">
          Собери сцену: персонаж, поза, свет и стиль — получи готовый кадр.
        </p>
      </div>
      <PhotoLabForm
        characters={characters.map((c) => ({
          id: c.id,
          name: c.name,
          gender: c.gender,
          loraStatus: c.loraStatus,
          triggerWord: c.triggerWord,
        }))}
        poses={templates.poses}
        lego={{
          lighting: lego.lighting,
          events: lego.events,
          stylization: lego.stylization,
          body: lego.body || [],
        }}
      />
    </div>
  );
}
