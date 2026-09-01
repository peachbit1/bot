"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { OrientationSelect } from "@/components/orientation-select";
import { PromptLegoEditor } from "@/components/prompt-lego-editor";
import { TodayGenerationsStrip } from "@/components/today-generations-strip";
import {
  analyzeLegoTokens,
  buildLegoCatalog,
  parseLegoQuery,
  type LegoCatalogItem,
  type LegoCharacterRef,
} from "@/lib/prompt-lego-core";
import { photoBatchCost, SKU } from "@/lib/peach-economics";
import { loadPhotoRestore } from "@/lib/generation-restore";
import {
  kreaStillSize,
  type VideoOrientationId,
} from "@/lib/video-orientation";

type PoseProp = {
  id: string;
  label: string;
  text: string;
  videoMotion?: string;
};

type Char = LegoCharacterRef & {
  loraStatus: string;
};

type LegoStatic = {
  lighting: Array<Omit<LegoCatalogItem, "kind">>;
  events: Array<Omit<LegoCatalogItem, "kind">>;
  stylization: Array<Omit<LegoCatalogItem, "kind">>;
  body?: Array<Omit<LegoCatalogItem, "kind">>;
};

export function PhotoLabForm({
  characters,
  poses,
  lego,
}: {
  characters: Char[];
  poses: PoseProp[];
  lego: LegoStatic;
}) {
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [orientation, setOrientation] = useState<VideoOrientationId>("9_16");
  const [photoCount, setPhotoCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [stripRefresh, setStripRefresh] = useState(0);

  const hasCharacters = characters.length > 0;
  const blocked = !hasCharacters;

  useEffect(() => {
    const restored = loadPhotoRestore();
    if (restored) {
      setQuery(restored.legoQuery);
      setCharacterIds(restored.characterIds);
      if (restored.orientationId) {
        setOrientation(restored.orientationId as VideoOrientationId);
      }
    } else if (characters[0]) {
      setCharacterIds([characters[0].id]);
    }
  }, [characters]);

  const size = useMemo(() => kreaStillSize(orientation), [orientation]);
  const batchCost = photoBatchCost(photoCount);

  const baseCatalog = useMemo(
    () =>
      buildLegoCatalog({
        poses,
        lighting: lego.lighting,
        events: lego.events,
        stylization: lego.stylization,
        body: lego.body || [],
        characters,
      }),
    [poses, lego, characters],
  );

  const liveCatalog = useMemo(() => {
    const nonChar = baseCatalog.filter((c) => c.kind !== "character");
    const selected = characters.filter((c) => characterIds.includes(c.id));
    const chars: LegoCatalogItem[] = selected.map((c) => ({
      id: c.id,
      label: c.name,
      kind: "character" as const,
      aliases: [c.name, c.triggerWord || ""].filter(Boolean) as string[],
    }));
    return [...chars, ...nonChar];
  }, [baseCatalog, characters, characterIds]);

  const analyzed = useMemo(() => {
    const tokens = parseLegoQuery(query, liveCatalog);
    return analyzeLegoTokens(tokens, characters, liveCatalog);
  }, [query, liveCatalog, characters]);

  function toggleCharacter(id: string) {
    setCharacterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function generate() {
    setError("");
    if (blocked) return;
    if (!query.trim() && characterIds.length === 0) {
      setError("Добавь персонажа или опиши сцену блоками");
      return;
    }
    setSubmitting(true);
    try {
      const castIds =
        analyzed.characterIdsInOrder.length > 0
          ? analyzed.characterIdsInOrder
          : characterIds;

      const skinOn = !!analyzed.skinDetail;
      for (let i = 0; i < photoCount; i++) {
        const res = await fetch("/api/peach/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "photo",
            characterIds: castIds,
            characterId: castIds[0] || null,
            poseId: analyzed.poseId,
            styleId: analyzed.styleId,
            userNote: query,
            legoQuery: query,
            orientationId: orientation,
            photoCount,
            usePreset: !!analyzed.poseId,
            width: size.width,
            height: size.height,
            skinDetail: skinOn,
            skinDetailStrength: skinOn ? analyzed.skinDetailStrength ?? 1.2 : 0,
            title: photoCount > 1 ? `Фото ×${photoCount}` : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "ошибка");
          return;
        }
        setStripRefresh((k) => k + 1);
        break;
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div
          className={`relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#121214] p-4 ${blocked ? "pointer-events-none opacity-45" : ""}`}
        >
          {blocked ? (
            <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#0c0c0e]/75 p-6 text-center backdrop-blur-sm">
              <p className="text-sm text-zinc-400">
                Сначала нужен хотя бы один персонаж — без него генерация недоступна.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  href="/peach/characters"
                  className="rounded-full bg-peach px-4 py-2 text-sm font-medium text-black"
                >
                  Создать персонажа
                </Link>
                <Link
                  href="/peach/characters/library"
                  className="rounded-full border border-white/15 px-4 py-2 text-sm"
                >
                  Библиотека персонажей
                </Link>
              </div>
            </div>
          ) : null}

          <h2 className="font-medium">Генерация фото</h2>

          <div>
            <div className="mb-1.5 text-sm text-zinc-500">Персонажи</div>
            <div className="flex flex-wrap gap-1.5">
              {characters.map((c) => {
                const on = characterIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCharacter(c.id)}
                    className={
                      on
                        ? "rounded-full border border-peach/50 bg-peach/15 px-3 py-1 text-sm text-peach"
                        : "rounded-full border border-white/15 px-3 py-1 text-sm text-zinc-400 hover:border-white/25"
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-sm text-zinc-500">Сцена</div>
            <PromptLegoEditor
              catalog={baseCatalog}
              characters={characters}
              selectedIds={characterIds}
              value={query}
              onChange={setQuery}
              disabled={submitting || blocked}
              variant="photo"
            />
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-500">Ориентация кадра</span>
            <OrientationSelect
              value={orientation}
              onChange={setOrientation}
              className="w-full rounded-lg border border-white/10 bg-[#0c0c0e] px-3 py-2 text-sm"
              disabled={submitting || blocked}
            />
            <span className="text-xs text-zinc-600">
              {size.ratio} · {size.width}×{size.height}
            </span>
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-zinc-500">
              <span>Сколько фото</span>
              <span>{photoCount}</span>
            </div>
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={photoCount}
              disabled={submitting || blocked}
              onChange={(e) => setPhotoCount(Number(e.target.value))}
              className="accent-peach"
            />
            <span className="text-xs text-zinc-600">
              {SKU.photo} кр. × {photoCount} = {batchCost} кр.
            </span>
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="button"
            disabled={submitting || blocked}
            onClick={() => void generate()}
            className="rounded-full bg-peach px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50"
          >
            {submitting ? "В очередь…" : `Сгенерировать (${batchCost} кр.)`}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#121214] p-4 text-sm">
          <p className="font-medium text-foreground">Как пользоваться</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-zinc-500">
            <li>Выбери одного или нескольких персонажей.</li>
            <li>Нажми «+ блок» — поза, свет, событие, стиль или размер тела.</li>
            <li>Между блоками пиши текст прямо в той же строке — как [поза]своё[свет].</li>
            <li>Цвет блока подсказывает тип: персонаж, поза, свет и т.д.</li>
            <li>Выбери ориентацию и количество фото — жми генерацию.</li>
          </ol>
          <p className="mt-4 text-xs text-zinc-600">
            Готовые кадры за сегодня — под формой. Всё остальное — в галерее.
          </p>
        </div>
      </div>

      <TodayGenerationsStrip kind="photo" editor="photo" refreshKey={stripRefresh} />
    </div>
  );
}
