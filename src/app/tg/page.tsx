"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TgShell, useTgMiniApp } from "@/lib/tg/miniapp/client";

type VideoTpl = {
  id: string;
  title: string;
  notes: string;
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
  pricePeaches: number;
  previewImageUrl: string;
};

type FeedItem =
  | { kind: "video"; id: string; title: string; notes: string; preview: string; isVideo: true; price: number; durationSec: number; hasSpeech?: boolean }
  | { kind: "photo"; id: string; title: string; notes: string; preview: string; isVideo: false; price: number; durationSec: number };

const UI = {
  ru: {
    title: "🍑 Студия",
    all: "Все",
    video: "Видео",
    photo: "Фото",
    use: "Повторить позу",
    empty: "Шаблоны скоро появятся",
    speech: "🗣 речь",
  },
  en: {
    title: "🍑 Studio",
    all: "All",
    video: "Video",
    photo: "Photo",
    use: "Repeat pose",
    empty: "Templates coming soon",
    speech: "🗣 speech",
  },
} as const;

export default function TgFeedPage() {
  const router = useRouter();
  const { status, error, profile, locale, setLocale, sendAction, apiFetch } =
    useTgMiniApp();
  const [tab, setTab] = useState<"all" | "video" | "photo">("all");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const reelRef = useRef<HTMLDivElement>(null);

  const u = UI[locale];

  const load = useCallback(async () => {
    setLoadErr("");
    const kind = tab;
    const res = await apiFetch(`/api/tg/templates?kind=${kind}&locale=${locale}`);
    if (!res.ok) {
      setLoadErr("load");
      return;
    }
    const data = (await res.json()) as { video: VideoTpl[]; photo: PhotoTpl[] };
    const feed: FeedItem[] = [];
    if (tab !== "photo") {
      for (const v of data.video || []) {
        feed.push({
          kind: "video",
          id: v.id,
          title: v.title,
          notes: v.notes,
          preview: v.previewVideoUrl || v.previewPhotoUrl,
          isVideo: true,
          price: v.pricePeaches || 142,
          durationSec: v.durationSec,
          hasSpeech: v.hasSpeech,
        });
      }
    }
    if (tab !== "video") {
      for (const p of data.photo || []) {
        feed.push({
          kind: "photo",
          id: p.id,
          title: p.title,
          notes: p.notes,
          preview: p.previewImageUrl,
          isVideo: false,
          price: p.pricePeaches,
          durationSec: 0,
        });
      }
    }
    setItems(feed);
  }, [tab, locale, apiFetch]);

  useEffect(() => {
    if (status !== "ready") return;
    void load();
  }, [status, load]);

  useEffect(() => {
    const root = reelRef.current;
    if (!root) return;
    const videos = root.querySelectorAll("video");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) void v.play().catch(() => undefined);
          else v.pause();
        }
      },
      { threshold: 0.6 },
    );
    videos.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, [items]);

  if (status === "loading") return <p className="tg-loading">…</p>;
  if (status === "error") return <p className="tg-error">{error}</p>;

  return (
    <TgShell
      locale={locale}
      title={u.title}
      balance={profile?.balancePeaches}
      onLangToggle={() => setLocale(locale === "ru" ? "en" : "ru")}
    >
      <nav className="tg-tabs" style={{ padding: "0 1rem 0.65rem" }}>
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

      {loadErr && <p className="tg-error">Не удалось загрузить</p>}

      {!loadErr && items.length === 0 && <p className="tg-muted">{u.empty}</p>}

      <div className="tg-reels" ref={reelRef}>
        {items.map((item) => (
          <article key={`${item.kind}-${item.id}`} className="tg-reel">
            <div className="tg-reel-stage">
              {item.isVideo ? (
                <video
                  src={item.preview}
                  className="tg-reel-media"
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  poster={item.preview.endsWith(".mp4") ? undefined : item.preview}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.preview} alt="" className="tg-reel-media" />
              )}
            </div>
            <div className="tg-reel-dock">
              <strong>{item.title}</strong>
              {item.notes ? <p>{item.notes}</p> : null}
              <div className="tg-reel-meta">
                <span className="tg-price">
                  {item.price} 🍑
                  {item.kind === "video" && item.durationSec
                    ? ` · ~${item.durationSec}с`
                    : ""}
                  {item.kind === "video" && item.hasSpeech ? ` · ${u.speech}` : ""}
                </span>
                <button
                  type="button"
                  className="tg-use-btn"
                  onClick={() => {
                    if (item.kind === "video") {
                      router.push(
                        `/tg/video-flow?templateId=${encodeURIComponent(item.id)}`,
                      );
                      return;
                    }
                    router.push("/tg/characters");
                  }}
                >
                  {u.use}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </TgShell>
  );
}
