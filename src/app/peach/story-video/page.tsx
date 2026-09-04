import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { StoryVideoLabClient } from "@/components/story-video-lab-client";

export default async function StoryVideoLabPage() {
  const user = await requireUser();
  if (!user) return null;

  const characters = await prisma.character.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium">Story H3 видео</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Генератор по полному MiniMax H3 Ref2V-промпту из Grok. Шоты не собираем табами —
          хронологию пишет Grok внутри <code className="text-xs">detailed_description</code>.
          Личность берётся из персонажа / Picture 1–3; локация и motion — опциональные слоты.
        </p>
      </div>
      <StoryVideoLabClient characters={characters} />
    </div>
  );
}
