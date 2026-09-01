import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CharacterLab } from "@/components/character-lab";

export default async function PeachCharactersPage() {
  const user = await requireUser();
  if (!user) return null;

  const characters = await prisma.character.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Персонажи</h2>
        <p className="text-sm text-zinc-500">
          Создай героя по фото или описанию — его внешность будет во всех генерациях.
        </p>
      </div>
      <CharacterLab characters={characters} />
    </div>
  );
}
