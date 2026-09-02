"use client";

import { useCallback, useEffect, useState } from "react";

type VideoTpl = {
  id: string;
  title: string;
  notes: string;
  category: string;
  previewVideoUrl: string;
  previewPhotoUrl: string;
  durationSec: number;
  pricePeaches: number;
  hasSpeech?: boolean;
};

type PhotoTpl = {
  id: string;
  title: string;
  notes: string;
  tier: string;
  pricePeaches: number;
  previewImageUrl: string;
  hasSpeech?: boolean;
};

const UI = {
  ru: {
    openInTg: "Откройте из Telegram Mini App",
    authErr: "Ошибка авторизации",
    loadErr: "Не удалось загрузить шаблоны",
    title: "🍑 Шаблоны",
    all: "Все",
    video: "Видео",
    photo: "Фото",
    use: "Использовать",
    empty: "Шаблонов пока нет",
    lang: "EN",
    speech: "🗣 с речью",
  },
  en: {
    openInTg: "Open from Telegram Mini App",
    authErr: "Auth failed",
    loadErr: "Could not load templates",
    title: "🍑 Templates",
    all: "All",
    video: "Video",
    photo: "Photo",
    use: "Use",
    empty: "No templates yet",
    lang: "RU",
    speech: "🗣 speech",
  },
} as const;

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        sendData: (data: string) => void;
      };
    };
  }
}

export default function TgTemplatesPage() {
  const [tab, setTab] = useState<"all" | "video" | "photo">("all");
  const [locale, setLocale] = useState<"ru" | "en">("ru");
  const [video, setVideo] = useState<VideoTpl[]>([]);
  const [photo, setPhoto] = useState<PhotoTpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeVideo] = useState(0);

  const u = UI[locale];

  const auth = useCallback(async () => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setError(UI.ru.openInTg);
      setLoading(false);
      return false;
    }
    const res = await fetch("/api/tg/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, locale }),
    });
    if (!res.ok) {
      setError(u.authErr);
      setLoading(false);
      return false;
    }
    const data = (await res.json()) as { locale?: string };
    if (data.locale === "en" || data.locale === "ru") setLocale(data.locale);
    await fetch("/api/tg/miniapp-heartbeat", { method: "POST" });
    return true;
  }, [locale, u.authErr]);

  const load = useCallback(async () => {
    setLoading(true);
    const kind = tab === "all" ? "all" : tab;
    const res = await fetch(`/api/tg/templates?kind=${kind}&locale=${locale}`);
    if (!res.ok) {
      setError(u.loadErr);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { video: VideoTpl[]; photo: PhotoTpl[] };
    setVideo(data.video || []);
    setPhoto(data.photo || []);
    setLoading(false);
  }, [tab, locale, u.loadErr]);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    void (async () => {
      const ok = await auth();
      if (ok) await load();
    })();
  }, [auth, load]);

  useEffect(() => {
    if (!loading && !error) void load();
  }, [tab, load, loading, error]);

  const useTemplate = (kind: "video" | "photo", id: string, price: number) => {
    window.Telegram?.WebApp?.sendData(
      JSON.stringify({ action: "use_template", kind, templateId: id, price }),
    );
    window.Telegram?.WebApp?.close();
  };

  const items =
    tab === "photo"
      ? photo.map((p) => ({ kind: "photo" as const, ...p }))
      : tab === "video"
        ? video.map((v) => ({
            kind: "video" as const,
            id: v.id,
            title: v.title,
            notes: v.notes,
            preview: v.previewVideoUrl || v.previewPhotoUrl,
            price: v.pricePeaches || 142,
            durationSec: v.durationSec,
          }))
        : [
            ...video.map((v) => ({
              kind: "video" as const,
              id: v.id,
              title: v.title,
              notes: v.notes,
              preview: v.previewVideoUrl || v.previewPhotoUrl,
              price: v.pricePeaches || 142,
              durationSec: v.durationSec,
            })),
            ...photo.map((p) => ({
              kind: "photo" as const,
              id: p.id,
              title: p.title,
              notes: p.notes,
              preview: p.previewImageUrl,
              price: p.pricePeaches,
              durationSec: 0,
            })),
          ];

  return (
    <main className="tg-templates">
      <header className="tg-header">
        <div className="tg-header-row">
          <h1>{u.title}</h1>
          <button
            type="button"
            className="tg-lang"
            onClick={() => setLocale(locale === "ru" ? "en" : "ru")}
          >
            {u.lang}
          </button>
        </div>
        <nav className="tg-tabs">
          {(["all", "video", "photo"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t === "all" ? u.all : t === "video" ? u.video : u.photo}
            </button>
          ))}
        </nav>
      </header>

      {loading && <p className="tg-muted">…</p>}
      {error && <p className="tg-error">{error}</p>}

      {!loading && !error && tab !== "photo" && video.length > 0 && (
        <section className="tg-feed">
          {video.map((v, i) => (
            <article
              key={v.id}
              className={`tg-card ${i === activeVideo ? "active" : ""}`}
            >
              {v.previewVideoUrl ? (
                <video
                  src={v.previewVideoUrl}
                  autoPlay={i === activeVideo}
                  loop
                  muted
                  playsInline
                  className="tg-preview"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.previewPhotoUrl}
                  alt=""
                  className="tg-preview"
                />
              )}
              <div className="tg-card-footer">
                <div>
                  <strong>{v.title}</strong>
                  <p>{v.notes}</p>
                  <span className="tg-price">
                    {v.pricePeaches} 🍑 · ~{v.durationSec}с
                    {v.hasSpeech ? ` · ${u.speech}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="tg-use-btn"
                  onClick={() =>
                    useTemplate("video", v.id, v.pricePeaches)
                  }
                >
                  {u.use}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && !error && (tab === "photo" || tab === "all") && photo.length > 0 && (
        <section className="tg-photo-grid">
          {photo.map((p) => (
            <article key={p.id} className="tg-photo-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewImageUrl} alt="" />
              <div>
                <strong>{p.title}</strong>
                <span>{p.pricePeaches} 🍑</span>
                <button
                  type="button"
                  onClick={() => useTemplate("photo", p.id, p.pricePeaches)}
                >
                  {u.use}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="tg-muted">{u.empty}</p>
      )}

      <style jsx>{`
        .tg-templates {
          min-height: 100dvh;
          background: #0a0a0f;
          color: #f5f5f7;
          font-family: system-ui, sans-serif;
          padding: 0 0 2rem;
        }
        .tg-header {
          position: sticky;
          top: 0;
          z-index: 10;
          background: #0a0a0fcc;
          backdrop-filter: blur(8px);
          padding: 1rem;
        }
        .tg-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }
        h1 {
          margin: 0;
          font-size: 1.25rem;
        }
        .tg-lang {
          border: 1px solid #444;
          background: transparent;
          color: #ff4d8d;
          border-radius: 8px;
          padding: 0.35rem 0.65rem;
        }
        .tg-tabs {
          display: flex;
          gap: 0.5rem;
        }
        .tg-tabs button {
          flex: 1;
          padding: 0.5rem;
          border: 1px solid #333;
          border-radius: 8px;
          background: transparent;
          color: #aaa;
        }
        .tg-tabs button.active {
          background: #ff4d8d22;
          border-color: #ff4d8d;
          color: #ff4d8d;
        }
        .tg-feed {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
        }
        .tg-card {
          border-radius: 16px;
          overflow: hidden;
          background: #14141c;
        }
        .tg-preview {
          width: 100%;
          aspect-ratio: 9/16;
          object-fit: cover;
          background: #000;
        }
        .tg-card-footer {
          padding: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 1rem;
        }
        .tg-card-footer p {
          margin: 0.25rem 0;
          font-size: 0.85rem;
          color: #888;
        }
        .tg-price {
          font-size: 0.9rem;
          color: #ff4d8d;
        }
        .tg-use-btn {
          background: linear-gradient(135deg, #ff4d8d, #ff8a4d);
          border: none;
          color: #fff;
          padding: 0.65rem 1rem;
          border-radius: 12px;
          font-weight: 600;
          white-space: nowrap;
        }
        .tg-photo-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          padding: 1rem;
        }
        .tg-photo-card {
          background: #14141c;
          border-radius: 12px;
          overflow: hidden;
        }
        .tg-photo-card img {
          width: 100%;
          aspect-ratio: 3/4;
          object-fit: cover;
        }
        .tg-photo-card div {
          padding: 0.75rem;
        }
        .tg-photo-card button {
          margin-top: 0.5rem;
          width: 100%;
          padding: 0.5rem;
          border-radius: 8px;
          border: none;
          background: #ff4d8d;
          color: #fff;
        }
        .tg-muted {
          padding: 2rem;
          text-align: center;
          color: #666;
        }
        .tg-error {
          padding: 2rem;
          text-align: center;
          color: #ff6b6b;
        }
      `}</style>
    </main>
  );
}
