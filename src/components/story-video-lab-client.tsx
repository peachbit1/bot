"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TodayGenerationsStrip } from "@/components/today-generations-strip";
import { OrientationSelect } from "@/components/orientation-select";
import type { VideoOrientationId } from "@/lib/video-orientation";
import type { QuickVideoSlotRole } from "@/lib/quick-video-prompt";
import {
  loadStoryVideoRestore,
  PEACH_STORY_VIDEO_RESTORE_EVENT,
  type StoryVideoRestorePayload,
} from "@/lib/generation-restore";
import { parseStoryH3Template } from "@/lib/story-h3-prompt";
import { CharacterBodySettingsPanel } from "@/components/character-body-settings-panel";

type Char = { id: string; name: string };

const SLOT_ROLES: Array<{ id: QuickVideoSlotRole; label: string }> = [
  { id: "identity", label: "Identity" },
  { id: "location", label: "Location" },
  { id: "pose", label: "Pose" },
  { id: "object", label: "Object" },
  { id: "anatomy", label: "Anatomy" },
  { id: "other", label: "Other" },
];

type SlotState = {
  file: File | null;
  role: QuickVideoSlotRole;
  label: string;
};

function defaultSlots(): SlotState[] {
  return Array.from({ length: 6 }, (_, i) => ({
    file: null,
    role: (i < 3 ? "identity" : i === 3 ? "location" : "other") as QuickVideoSlotRole,
    label: "",
  }));
}

async function readJson(res: Response) {
  const raw = await res.text();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Сервер вернул не JSON (${res.status})`);
  }
}

async function blobFromUrl(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

const GROK_BRIEF = `Ты пишешь production-ready промпт для MiniMax H3 Full-Reference / Ref2VA (Ref2V) строго по приложенному гайду (referensguide.md).

КОНТЕКСТ ПЛАТФОРМЫ PEACHBITCH
- Генерация идёт через Ref2V: к промпту прикладываются фото-слоты и опционально motion-видео.
- Личность девушки НЕ известна тебе заранее и будет подставляться позже из фото пользователя.
- Твоя задача — зафиксировать СЮЖЕТ / КАМЕРУ / СРЕДУ / ДЕЙСТВИЕ / ЗВУК так, чтобы потом та же сцена воспроизводилась с ДРУГОЙ девушкой.

КОНТРАКТ СЛОТОВ (обязателен)
- <Picture 1>, <Picture 2>, <Picture 3> = ТОЛЬКО identity девушки пользователя (лицо/тело/волосы/кожа). Конкретных черт внешности НЕ выдумывай.
- <Picture 4> = локация/среда (будет отдельной картинкой), если локация важна.
- <Picture 5+> = опционально поза / объект / анатомия — только если реально нужно.
- <Video 1> = опциональный motion/pose drive; используй только если я явно скажу, что будет motion-реф.
- <Subject 1> = девушка из Picture 1–3. Identity: fully_preserved. Без описания лица/возраста/расы/цвета волос как «факта» — только отсылка к рефам.

ЧТО ЖДАТЬ ОТ МЕНЯ
Я пришлю детали сюжета отдельным сообщением: что происходит, стиль, локация, одежда/состояние, камера, речь (если нужна), длительность (до 12 сек), NSFW-детали если есть, нужен ли music или N/A.
Пока деталей нет — НЕ пиши финальный промпт. Спроси коротко, чего не хватает, или просто жди.

ЧТО ВЫДАТЬ (когда детали будут)
Ровно 6 секций гайда, на английском (диалоги — русский в <d>[Russian] …</d>):
1) subject_definitions
2) summary  — начинай с [reference generation]
3) retention_analysis — identity fully_preserved; локация/пропсы по роли
4) detailed_description — стиль + хронология [Shot N] с таймкодами внутри запрошенной длительности. Шоты режь сам, если сюжет требует; можно и один шот.
5) overall_soundscape
6) non_diegetic_music — или N/A

ЗАПРЕЩЕНО
- Описывать конкретное лицо/причёску/этничность девушки как заданные факты.
- Делать video continuation / motion context, если я этого не просил.
- Добавлять лишние объяснения, альтернативы, markdown вне 6 секций.
- Подменять identity слабым weak_reference.

ЦЕЛЬ
Промпт должен дать узнаваемый тот же сюжет/постановку, что я опишу, а лицо всегда браться из Picture 1–3 пользователя.`;

export function StoryVideoLabClient({ characters }: { characters: Char[] }) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [characterId, setCharacterId] = useState(characters[0]?.id || "");
  const [orientation, setOrientation] = useState<VideoOrientationId>("9_16");
  const [durationSec, setDurationSec] = useState(8);
  const [slots, setSlots] = useState<SlotState[]>(defaultSlots);
  const [poseVideo, setPoseVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [restoreMsg, setRestoreMsg] = useState("");
  const [stripRefresh, setStripRefresh] = useState(0);
  const [briefCopied, setBriefCopied] = useState(false);

  const promptLen = prompt.trim().length;
  const canSubmit = useMemo(
    () => promptLen >= 80 && (Boolean(characterId) || slots.some((s) => s.file && s.role === "identity")),
    [promptLen, characterId, slots],
  );

  const applyRestore = useCallback(
    async (payload: StoryVideoRestorePayload) => {
      let nextPrompt = payload.prompt || "";
      let nextTitle = payload.title || "";
      let nextOrientation = (payload.orientation || "9_16") as VideoOrientationId;
      let nextDuration = payload.durationSec || 8;
      let nextCharacterIds = payload.characterIds || [];
      let refSlots = payload.refSlots || [];
      let refImageUrls = payload.refImageUrls || [];
      let refVideoUrl = payload.refVideoUrl || "";

      if (payload.runId) {
        try {
          const d = await fetch("/api/peach/quick-video/runs").then((r) => r.json());
          const run = ((d.runs as Array<Record<string, unknown>>) || []).find(
            (x) => x.id === payload.runId,
          );
          if (run) {
            nextTitle = String(run.title || nextTitle);
            // run.prompt is raw H3 for story; composedPrompt is rebuilt
            nextPrompt = String(run.prompt || nextPrompt);
            nextOrientation = (String(run.orientation || nextOrientation) ||
              "9_16") as VideoOrientationId;
            nextDuration = Number(run.durationSec) || nextDuration;
            nextCharacterIds = (run.characterIds as string[]) || nextCharacterIds;
            refSlots = (run.refSlots as typeof refSlots) || refSlots;
            refImageUrls = (run.refImageUrls as string[]) || refImageUrls;
            refVideoUrl = String(run.refVideoUrl || refVideoUrl);
          }
        } catch {
          /* keep payload */
        }
      }

      // If prompt came as stored template wrapper
      const wrapped = parseStoryH3Template(nextPrompt);
      if (wrapped) {
        nextPrompt = wrapped.prompt;
        nextDuration = wrapped.totalDurationSec || nextDuration;
      }

      if (nextTitle) setTitle(nextTitle);
      if (nextPrompt) setPrompt(nextPrompt);
      setOrientation(nextOrientation);
      setDurationSec(Math.min(12, Math.max(4, nextDuration)));
      if (nextCharacterIds[0]) setCharacterId(nextCharacterIds[0]);

      // Restore non-identity baked slots as files; identity comes from character pick.
      if (refSlots.length && refImageUrls.length) {
        const next = defaultSlots();
        for (let i = 0; i < Math.min(refSlots.length, next.length); i++) {
          const slot = refSlots[i]!;
          const role = (slot.role ||
            (slot.kind === "identity" ? "identity" : "other")) as QuickVideoSlotRole;
          next[i] = {
            file: null,
            role,
            label: slot.label || "",
          };
          if (role === "identity") continue;
          const url = refImageUrls[i];
          if (!url) continue;
          const blob = await blobFromUrl(url);
          if (!blob) continue;
          next[i]!.file = new File([blob], `ref-${i + 1}.png`, {
            type: blob.type || "image/png",
          });
        }
        setSlots(next);
      }

      if (refVideoUrl) {
        const blob = await blobFromUrl(refVideoUrl);
        if (blob) {
          setPoseVideo(
            new File([blob], "pose.mp4", { type: blob.type || "video/mp4" }),
          );
        }
      }

      setRestoreMsg(
        "Настройки Story H3 загружены — смени персонажа/модель и запусти снова",
      );
      setError("");
      setWarning("");
    },
    [],
  );

  useEffect(() => {
    const pending = loadStoryVideoRestore();
    if (pending) {
      void applyRestore(pending).catch(() =>
        setError("Не удалось загрузить настройки Story H3"),
      );
    }

    const onRestore = (event: Event) => {
      const payload = (event as CustomEvent<StoryVideoRestorePayload>).detail;
      if (!payload) return;
      void applyRestore(payload).catch(() =>
        setError("Не удалось загрузить настройки Story H3"),
      );
    };
    window.addEventListener(PEACH_STORY_VIDEO_RESTORE_EVENT, onRestore);

    // Apply story template from ?storyTemplate= / qvTemplate redirect
    const params = new URLSearchParams(window.location.search);
    const storyTemplateId =
      params.get("storyTemplate") || params.get("qvTemplate");
    if (storyTemplateId) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/peach/quick-video/templates/${storyTemplateId}`,
          );
          const data = await readJson(res);
          if (!res.ok) throw new Error(String(data.error || "ошибка"));
          const tpl = data.template as {
            title?: string;
            shotsJson?: string;
            orientation?: string;
            durationSec?: number;
            refVideoUrl?: string;
            slotBlueprint?: Array<{
              role: QuickVideoSlotRole;
              label?: string;
              bakedRefUrl?: string;
              pictureIndex?: number;
            }>;
          };
          const story = parseStoryH3Template(String(tpl.shotsJson || ""));
          if (!story) {
            setError("Это не Story H3 шаблон — открой его в Быстром видео");
            return;
          }
          const next = defaultSlots();
          for (const bp of tpl.slotBlueprint || []) {
            if (bp.role === "identity") continue;
            if (!bp.bakedRefUrl) continue;
            const idx = Math.min(
              5,
              Math.max(0, (bp.pictureIndex || 4) - 1),
            );
            const blob = await blobFromUrl(bp.bakedRefUrl);
            if (!blob) continue;
            next[idx] = {
              file: new File([blob], `slot-${idx + 1}.png`, {
                type: blob.type || "image/png",
              }),
              role: bp.role,
              label: bp.label || "",
            };
          }
          setSlots(next);
          setTitle(tpl.title || "Story H3");
          setPrompt(story.prompt);
          setOrientation((tpl.orientation || "9_16") as VideoOrientationId);
          setDurationSec(story.totalDurationSec || tpl.durationSec || 8);
          if (tpl.refVideoUrl) {
            const blob = await blobFromUrl(tpl.refVideoUrl);
            if (blob) {
              setPoseVideo(
                new File([blob], "pose.mp4", {
                  type: blob.type || "video/mp4",
                }),
              );
            }
          }
          setRestoreMsg("Story-шаблон загружен — выбери персонажа и генерируй");
          const u = new URL(window.location.href);
          u.searchParams.delete("storyTemplate");
          u.searchParams.delete("qvTemplate");
          window.history.replaceState({}, "", u.pathname + u.search);
        } catch (e) {
          setError(e instanceof Error ? e.message : "error");
        }
      })();
    }

    return () => {
      window.removeEventListener(PEACH_STORY_VIDEO_RESTORE_EVENT, onRestore);
    };
  }, [applyRestore]);

  async function onGenerate() {
    setBusy(true);
    setError("");
    setWarning("");
    setRestoreMsg("");
    try {
      const fd = new FormData();
      if (title.trim()) fd.set("title", title.trim());
      fd.set("prompt", prompt.trim());
      fd.set("orientation", orientation);
      fd.set("durationSec", String(durationSec));
      if (characterId) fd.set("characterIds", JSON.stringify([characterId]));

      const slotMeta: Array<{
        pictureIndex: number;
        role: QuickVideoSlotRole;
        label?: string;
      }> = [];
      slots.forEach((slot, idx) => {
        const pictureIndex = idx + 1;
        if (slot.file) {
          fd.set(`picture_${pictureIndex}`, slot.file);
          slotMeta.push({
            pictureIndex,
            role: slot.role,
            label: slot.label.trim() || undefined,
          });
        }
      });
      if (slotMeta.length) fd.set("slotMeta", JSON.stringify(slotMeta));
      if (poseVideo) fd.set("poseVideo", poseVideo);

      const res = await fetch("/api/peach/story-video/generate", {
        method: "POST",
        body: fd,
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data.error || "ошибка"));
      if (data.warning) setWarning(String(data.warning));
      setStripRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyBrief() {
    await navigator.clipboard.writeText(GROK_BRIEF);
    setBriefCopied(true);
    setTimeout(() => setBriefCopied(false), 1600);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Бриф для Grok</h2>
            <p className="mt-1 max-w-2xl text-xs text-zinc-500">
              Сначала кинь Grok гайд <code className="text-zinc-400">referensguide.md</code>, потом
              этот бриф. Детали сюжета — следующим сообщением. Он вернёт 6 секций H3 без лица
              конкретной девушки.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyBrief()}
            className="rounded-full border border-peach/40 bg-peach/10 px-3 py-1.5 text-xs text-peach hover:bg-peach/20"
          >
            {briefCopied ? "Скопировано" : "Скопировать бриф"}
          </button>
        </div>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-white/5 bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-400">
          {GROK_BRIEF}
        </pre>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
          <label className="text-xs text-zinc-400">
            Название (опционально)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
              placeholder="Story H3 — …"
            />
          </label>

          <label className="text-xs text-zinc-400">
            Полный H3-промпт от Grok
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={18}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] leading-relaxed text-zinc-100"
              placeholder={"subject_definitions:\n...\n\nsummary:\n...\n\ndetailed_description:\n..."}
            />
            <span className="mt-1 block text-[11px] text-zinc-600">{promptLen} символов</span>
          </label>

          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-zinc-400">
              Длительность: {durationSec}s
              <input
                type="range"
                min={4}
                max={12}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="mt-2 block w-48"
              />
            </label>
            <div className="text-xs text-zinc-400">
              Ориентация
              <div className="mt-1">
                <OrientationSelect value={orientation} onChange={setOrientation} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
          <CharacterBodySettingsPanel
            characters={characters}
            characterId={characterId}
            onCharacterIdChange={setCharacterId}
          />

          <div>
            <div className="text-xs font-medium text-zinc-300">Доп. Picture-слоты</div>
            <p className="mt-1 text-[11px] text-zinc-600">
              1–3 = identity (если не хватает персонажа), 4 = location, дальше по роли.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {slots.map((slot, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 rounded-lg border border-white/5 bg-black/30 p-2"
                >
                  <span className="text-[11px] text-zinc-500">P{idx + 1}</span>
                  <select
                    value={slot.role}
                    onChange={(e) => {
                      const role = e.target.value as QuickVideoSlotRole;
                      setSlots((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, role } : s)),
                      );
                    }}
                    className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-[11px]"
                  >
                    {SLOT_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setSlots((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, file } : s)),
                      );
                    }}
                    className="text-[10px] text-zinc-400"
                  />
                </div>
              ))}
            </div>
          </div>

          <label className="text-xs text-zinc-400">
            Motion / pose video (опционально → Video 1)
            <input
              type="file"
              accept="video/*"
              className="mt-1 block w-full text-[11px] text-zinc-400"
              onChange={(e) => setPoseVideo(e.target.files?.[0] || null)}
            />
          </label>

          {restoreMsg ? (
            <p className="text-sm text-emerald-400/90">{restoreMsg}</p>
          ) : null}
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {warning ? <p className="text-sm text-amber-300/90">{warning}</p> : null}

          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={() => void onGenerate()}
            className="rounded-full bg-gradient-to-r from-[#ffcab0] via-[#ff8a5c] to-[#ff6c85] px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
          >
            {busy ? "Ставлю в очередь…" : "Сгенерировать Story H3"}
          </button>
        </div>
      </section>

      <TodayGenerationsStrip kind="video" editor="video" refreshKey={stripRefresh} />
    </div>
  );
}
