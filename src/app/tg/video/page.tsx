"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TgShell, useTgMiniApp } from "@/lib/tg/miniapp/client";

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
    title: "Сделать видео",
    pick: "1. Выбери позу",
    upload: "2. Загрузи фото персонажа",
    useSaved: "Или выбери сохранённую модель",
    generate: "Снять видео",
    choose: "Выбрать",
    back: "← К позам",
    needPhoto: "Нужно минимум 1 фото",
    starting: "Запускаю…",
  },
  en: {
    title: "Make video",
    pick: "1. Pick a pose",
    upload: "2. Upload character photos",
    useSaved: "Or pick a saved model",
    generate: "Shoot video",
    choose: "Choose",
    back: "← Poses",
    needPhoto: "Need at least 1 photo",
    starting: "Starting…",
  },
} as const;

function togglePreview(el: HTMLVideoElement) {
  if (el.paused) void el.play().catch(() => undefined);
  else el.pause();
}

function VideoPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const presetId = params.get("templateId") || "";
  const presetCharacterId = params.get("characterId") || "";

  const { status, error, profile, locale, apiFetch, refresh } = useTgMiniApp();
  const u = UI[locale];

  const [templates, setTemplates] = useState<VideoTpl[]>([]);
  const [templateId, setTemplateId] = useState(presetId);
  const [refs, setRefs] = useState<VideoRef[]>([]);
  const [characterId, setCharacterId] = useState<string | null>(
    presetCharacterId || null,
  );
  const [photoCount, setPhotoCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [tRes, rRes] = await Promise.all([
      apiFetch(`/api/tg/templates?kind=video&locale=${locale}`),
      apiFetch("/api/tg/video-refs"),
    ]);
    if (tRes.ok) {
      const data = (await tRes.json()) as { video: VideoTpl[] };
      setTemplates(data.video || []);
      if (presetId && data.video.some((v) => v.id === presetId)) {
        setTemplateId(presetId);
      }
    }
    if (rRes.ok) {
      const data = (await rRes.json()) as { refs: VideoRef[] };
      setRefs(data.refs || []);
      if (presetCharacterId) {
        const hit = (data.refs || []).find((r) => r.id === presetCharacterId);
        if (hit?.ready) {
          setCharacterId(hit.id);
          setPhotoCount(hit.photoCount);
          setReady(true);
        }
      }
    }
  }, [apiFetch, locale, presetId, presetCharacterId]);

  useEffect(() => {
    if (status !== "ready") return;
    void load();
  }, [status, load]);

  const tpl = templates.find((t) => t.id === templateId) || null;

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
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        need?: number;
        balance?: number;
      };
      if (j.error === "insufficient_balance") {
        setErr(
          locale === "en"
            ? `Not enough peaches (need ${j.need}, have ${j.balance})`
            : `Недостаточно персиков (нужно ${j.need}, есть ${j.balance})`,
        );
      } else {
        setErr(j.error || "error");
      }
      return;
    }
    void refresh();
    router.push("/tg/gallery");
  };

  if (status === "loading") return <p className="tg-loading">…</p>;
  if (status === "error") return <p className="tg-error">{error}</p>;

  return (
    <TgShell locale={locale}>
      {!tpl ? (
        <>
          <div className="tg-section" style={{ paddingBottom: "0.35rem" }}>
            <h2 style={{ margin: 0 }}>{u.pick}</h2>
            <p className="tg-muted tg-section-hint">
              {locale === "ru"
                ? "Нажми на превью — видео играет. Ещё раз — стоп."
                : "Tap preview to play. Tap again to pause."}
            </p>
          </div>
          <div className="tg-portrait-grid" style={{ padding: "0 0.75rem 1rem" }}>
            {templates.map((t) => (
              <div key={t.id} className="tg-portrait-card">
                <div className="tg-portrait-media">
                  {t.previewVideoUrl ? (
                    <video
                      src={t.previewVideoUrl}
                      className="tg-video-preview"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      poster={t.previewPhotoUrl || undefined}
                      onClick={(e) => togglePreview(e.currentTarget)}
                    />
                  ) : t.previewPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.previewPhotoUrl} alt="" className="tg-portrait-img" />
                  ) : (
                    <div className="tg-portrait-placeholder" />
                  )}
                </div>
                <div className="tg-portrait-meta">
                  <strong>{t.title}</strong>
                  <small>{t.pricePeaches} 🍑</small>
                </div>
                <button
                  type="button"
                  className="tg-primary-btn"
                  style={{ width: "100%", marginTop: "0.4rem" }}
                  onClick={() => setTemplateId(t.id)}
                >
                  {u.choose}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: "0 1rem 1rem" }}>
          <button type="button" className="tg-lang" onClick={() => setTemplateId("")}>
            {u.back}
          </button>
          <div style={{ marginTop: "0.75rem" }}>
            <strong>{tpl.title}</strong>
            <span className="tg-muted"> · {tpl.pricePeaches} 🍑</span>
            {tpl.previewVideoUrl && (
              <video
                src={tpl.previewVideoUrl}
                className="tg-reel-media"
                style={{
                  marginTop: "0.5rem",
                  maxHeight: 240,
                  width: "100%",
                  borderRadius: 12,
                }}
                muted
                loop
                playsInline
                onClick={(e) => togglePreview(e.currentTarget)}
              />
            )}
          </div>

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
              <h2 style={{ fontSize: "1rem", margin: "1rem 0 0.5rem" }}>
                {u.useSaved}
              </h2>
              <div className="tg-card-list">
                {refs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`tg-char-card ${characterId === r.id ? "active" : ""}`}
                    disabled={!r.ready}
                    onClick={() => {
                      if (!r.ready) return;
                      setCharacterId(r.id);
                      setPhotoCount(r.photoCount);
                      setReady(true);
                    }}
                  >
                    <div>
                      <strong>{r.name}</strong>
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
      )}
    </TgShell>
  );
}

export default function TgVideoPage() {
  return (
    <Suspense fallback={<p className="tg-loading">…</p>}>
      <VideoPageInner />
    </Suspense>
  );
}
