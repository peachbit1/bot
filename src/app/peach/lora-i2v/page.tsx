import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LoraI2vLabClient } from "@/components/lora-i2v-lab-client";

export default async function LoraI2vLabPage() {
  const user = await requireUser();
  if (!user) return null;

  const characters = await prisma.character.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      loraStatus: true,
      triggerWord: true,
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium">LoRA → I2V шаблоны</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Рецепт: still на персонажной LoRA (Krea 2) → оживление Minimax I2V.
          Сохрани шаблон и перенеси в Telegram. У пользователей генерация только
          с обученной LoRA (рантайм подключим следующим шагом).
        </p>
      </div>
      <LoraI2vLabClient characters={characters} />
    </div>
  );
}
