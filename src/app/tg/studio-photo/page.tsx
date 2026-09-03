"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TgShell, useTgMiniApp } from "@/lib/tg/miniapp/client";

type PhotoTpl = {
  id: string;
  title: string;
  notes: string;
  pricePeaches: number;
  previewImageUrl: string;
};

const UI = {
  ru: {
    title: "📸 Фото с актрисой",
    pick: "Выбери шаблон",
    generate: "Снять",
    starting: "…",
    back: "← Назад",
    err: "Ошибка",
  },
  en: {
    title: "📸 Photo with actress",
    pick: "Pick a template",
    generate: "Shoot",
    starting: "…",
    back: "← Back",
    err: "Error",
  },
} as const;

function StudioPhotoPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const castId = params.get("castId") || "";
  const castName = params.get("name") || "";

  const { status, error, profile, locale, apiFetch, refresh } = useTgMiniApp();
  const u = UI[locale];

  const [templates, setTemplates] = useState<PhotoTpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/tg/templates?kind=photo&locale=${locale}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { photo: PhotoTpl[] };
    setTemplates(data.photo || []);
    setLoading(false);
  }, [apiFetch, locale]);

  useEffect(() => {
    if (status !== "ready") return;
    void load();
  }, [status, load]);

  const onGenerate = async (templateId: string) => {
    if (!castId) return;
    setBusy(templateId);
    setErr("");
    const res = await apiFetch("/api/tg/generate/photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, castId, locale }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        need?: number;
        balance?: number;
      };
      if (j.error === "insufficient_balance") {
        setErr(
          locale === "en"
            ? `Not enough peaches (need ${j.need}, have ${j.balance}). Send НАЧИСЛИ10000 to the bot.`
            : `Недостаточно персиков (нужно ${j.need}, есть ${j.balance}). Напиши боту НАЧИСЛИ10000`,
        );
      } else {
        setErr(j.error || u.err);
      }
      return;
    }
    void refresh();
    // Show pending tile in the gallery grid (not a fullscreen progress screen).
    router.push("/tg/gallery");
  };

  if (status === "loading") return <p className="tg-loading">…</p>;
  if (status === "error") return <p className="tg-error">{error}</p>;

  return (
    <TgShell locale={locale} title={u.title} balance={profile?.balancePeaches}>
      <div className="tg-section" style={{ paddingBottom: "0.25rem" }}>
        <button
          type="button"
          className="tg-lang"
          onClick={() => router.push("/tg/characters")}
        >
          {u.back}
        </button>
        {castName ? (
          <p className="tg-section-hint" style={{ marginTop: "0.55rem" }}>
            {castName}
          </p>
        ) : null}
        <h2 style={{ fontSize: "1rem", margin: "0.75rem 0 0.35rem" }}>{u.pick}</h2>
      </div>

      {err && <p className="tg-error">{err}</p>}
      {loading && <p className="tg-muted">…</p>}

      <div className="tg-portrait-grid" style={{ padding: "0 0.75rem 1rem" }}>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tg-portrait-card"
            disabled={busy === t.id}
            onClick={() => void onGenerate(t.id)}
          >
            <div className="tg-portrait-media">
              {t.previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.previewImageUrl} alt="" className="tg-portrait-img" />
              ) : (
                <div className="tg-portrait-placeholder" />
              )}
              <span className="tg-portrait-action ready">
                {busy === t.id ? u.starting : u.generate}
              </span>
            </div>
            <div className="tg-portrait-meta">
              <strong>{t.title}</strong>
              <small>{t.pricePeaches} 🍑</small>
            </div>
          </button>
        ))}
      </div>
    </TgShell>
  );
}

export default function StudioPhotoPage() {
  return (
    <Suspense fallback={<p className="tg-loading">…</p>}>
      <StudioPhotoPageInner />
    </Suspense>
  );
}
