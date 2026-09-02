"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TgShell, useTgMiniApp } from "@/lib/tg/miniapp/client";
import { TgGenerationProgress } from "@/lib/tg/miniapp/generation-view";

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
    back: "← Назад",
    starting: "Запускаю…",
    done: "Готово! Результат придёт в чат бота.",
    err: "Ошибка",
    close: "Закрыть",
  },
  en: {
    title: "📸 Photo with actress",
    pick: "Pick a template",
    generate: "Shoot",
    back: "← Back",
    starting: "Starting…",
    done: "Done! Result will arrive in the bot chat.",
    err: "Error",
    close: "Close",
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
  const [generatingId, setGeneratingId] = useState<string | null>(null);
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
            ? `Not enough peaches (need ${j.need}, have ${j.balance}). Send НАЧИСЛИ500 to the bot.`
            : `Недостаточно персиков (нужно ${j.need}, есть ${j.balance}). Напиши боту НАЧИСЛИ500`,
        );
      } else {
        setErr(j.error || u.err);
      }
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
      <div style={{ padding: "0 1rem 0.5rem" }}>
        <button type="button" className="tg-lang" onClick={() => router.push("/tg/characters")}>
          {u.back}
        </button>
        {castName && (
          <p className="tg-muted" style={{ marginTop: "0.5rem" }}>
            {castName}
          </p>
        )}
        <h2 style={{ fontSize: "1rem", margin: "0.75rem 0 0.5rem" }}>{u.pick}</h2>
      </div>

      {err && <p className="tg-error">{err}</p>}
      {loading && <p className="tg-muted">…</p>}

      <div className="tg-card-list" style={{ padding: "0 1rem" }}>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tg-char-card studio"
            disabled={busy === t.id}
            onClick={() => void onGenerate(t.id)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {t.previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.previewImageUrl}
                  alt=""
                  style={{ width: 56, height: 72, borderRadius: 8, objectFit: "cover" }}
                />
              ) : null}
              <div>
                <strong>{t.title}</strong>
                <small>{t.pricePeaches} 🍑</small>
              </div>
            </div>
            <span className="badge">{busy === t.id ? u.starting : u.generate}</span>
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
