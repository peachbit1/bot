"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TgShell, useTgMiniApp } from "@/lib/tg/miniapp/client";
import { TgGenerationProgress } from "@/lib/tg/miniapp/generation-view";

type VideoRef = { id: string; name: string; photoCount: number; ready: boolean };
type VideoTpl = {
  id: string;
  title: string;
  pricePeaches: number;
  previewVideoUrl: string;
  previewPhotoUrl: string;
};

const UI = {
  ru: {
    title: "🎬 Видео",
    upload: "Загрузить фото модели",
    useSaved: "Или выбери сохранённую 🎬",
    generate: "Сгенерировать",
    back: "← Назад",
    needPhoto: "Нужно минимум 1 фото",
    starting: "Запускаю…",
    done: "Видео генерируется — результат в чате бота.",
    close: "Закрыть",
    newModel: "+ Новая модель",
  },
  en: {
    title: "🎬 Video",
    upload: "Upload model photos",
    useSaved: "Or pick saved 🎬",
    generate: "Generate",
    back: "← Back",
    needPhoto: "Need at least 1 photo",
    starting: "Starting…",
    done: "Video is generating — check the bot chat.",
    close: "Close",
    newModel: "+ New model",
  },
} as const;

function VideoFlowPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const templateId = params.get("templateId") || "";

  const { status, error, profile, locale, apiFetch, refresh } = useTgMiniApp();
  const u = UI[locale];

  const [tpl, setTpl] = useState<VideoTpl | null>(null);
  const [refs, setRefs] = useState<VideoRef[]>([]);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [tRes, rRes] = await Promise.all([
      apiFetch(`/api/tg/templates?kind=video&locale=${locale}`),
      apiFetch("/api/tg/video-refs"),
    ]);
    if (tRes.ok) {
      const data = (await tRes.json()) as { video: VideoTpl[] };
      const hit = data.video.find((v) => v.id === templateId) || data.video[0];
      setTpl(hit || null);
    }
    if (rRes.ok) {
      const data = (await rRes.json()) as { refs: VideoRef[] };
      setRefs(data.refs || []);
    }
  }, [apiFetch, locale, templateId]);

  useEffect(() => {
    if (status !== "ready") return;
    void load();
  }, [status, load]);

  const ensureCharacter = async (): Promise<string | null> => {
    if (characterId) return characterId;
    const res = await apiFetch("/api/tg/video-refs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Модель" }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { id: string };
    setCharacterId(j.id);
    return j.id;
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr("");
    const cid = await ensureCharacter();
    if (!cid) {
      setErr("error");
      return;
    }
    for (let i = 0; i < files.length; i++) {
      const fd = new FormData();
      fd.set("characterId", cid);
      fd.set("file", files[i]!);
      const res = await apiFetch("/api/tg/video-refs", { method: "PUT", body: fd });
      if (!res.ok) {
        setErr("upload failed");
        return;
      }
      const j = (await res.json()) as { photoCount: number; ready: boolean };
      setPhotoCount(j.photoCount);
      setReady(j.ready);
    }
  };

  const pickRef = (ref: VideoRef) => {
    if (!ref.ready) return;
    setCharacterId(ref.id);
    setPhotoCount(ref.photoCount);
    setReady(true);
  };

  const onGenerate = async () => {
    if (!templateId || !ready || !characterId) {
      setErr(u.needPhoto);
      return;
    }
    setBusy(true);
    setErr("");
    const res = await apiFetch("/api/tg/generate/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, characterId, locale }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error || "error");
      return;
    }
    const j = (await res.json()) as { galleryItemId?: string };
    if (j.galleryItemId) {
      setGeneratingId(j.galleryItemId);
      void refresh();
    }
  };

  if (status === "loading") return <p className="tg-loading">…</p>;
  if (status === "error") return <p className="tg-error">{error}</p>;

  if (generatingId) {
    return (
      <TgShell locale={locale} title={u.title} balance={profile?.balancePeaches}>
        <TgGenerationProgress
          galleryItemId={generatingId}
          locale={locale}
          apiFetch={apiFetch}
          onBalanceRefresh={refresh}
          onGoGallery={() => router.push("/tg/gallery")}
        />
      </TgShell>
    );
  }

  return (
    <TgShell locale={locale} title={u.title} balance={profile?.balancePeaches}>
      <div style={{ padding: "0 1rem" }}>
        <button type="button" className="tg-lang" onClick={() => router.push("/tg")}>
          {u.back}
        </button>
        {tpl && (
          <div style={{ marginTop: "0.75rem" }}>
            <strong>{tpl.title}</strong>
            <span className="tg-muted"> · {tpl.pricePeaches} 🍑</span>
            {tpl.previewVideoUrl && (
              <video
                src={tpl.previewVideoUrl}
                className="tg-reel-media"
                style={{ marginTop: "0.5rem", maxHeight: 240, width: "100%", borderRadius: 12 }}
                loop
                muted
                playsInline
                autoPlay
              />
            )}
          </div>
        )}

        <h2 style={{ fontSize: "1rem", margin: "1rem 0 0.5rem" }}>{u.upload}</h2>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void onUpload(e.target.files)}
        />
        <button
          type="button"
          className="tg-primary-btn"
          style={{ width: "100%" }}
          onClick={() => fileRef.current?.click()}
        >
          📷 {u.upload} {photoCount > 0 ? `(${photoCount})` : ""}
        </button>

        {refs.length > 0 && (
          <>
            <h2 style={{ fontSize: "1rem", margin: "1rem 0 0.5rem" }}>{u.useSaved}</h2>
            <div className="tg-card-list">
              {refs.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`tg-char-card ${characterId === r.id ? "active" : ""}`}
                  disabled={!r.ready}
                  onClick={() => pickRef(r)}
                >
                  <div>
                    <strong>🎬 {r.name}</strong>
                    <small>📸 {r.photoCount}</small>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {err && <p className="tg-error">{err}</p>}

        <button
          type="button"
          className="tg-primary-btn"
          style={{ marginTop: "1rem", width: "100%" }}
          disabled={!ready || busy}
          onClick={() => void onGenerate()}
        >
          {busy ? u.starting : u.generate}
        </button>
      </div>
    </TgShell>
  );
}

export default function VideoFlowPage() {
  return (
    <Suspense fallback={<p className="tg-loading">…</p>}>
      <VideoFlowPageInner />
    </Suspense>
  );
}
