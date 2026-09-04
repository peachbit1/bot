"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TgShell, useTgMiniApp } from "@/lib/tg/miniapp/client";
import { TgCharacterBodyEditor } from "@/lib/tg/miniapp/character-body-editor";

type CharTab = "showcase" | "personal" | "favorites";

const UI = {
  ru: {
    tabShowcase: "Каталог",
    tabPersonal: "Личные",
    tabFavorites: "Избранное",
    showcaseHint: "Актрисы студии — LoRA уже обучена",
    personalHint: "Твои модели после обучения LoRA",
    favoritesHint: "Актрисы, отмеченные ★",
    emptyPersonal: "Пока нет своих моделей — обучи LoRA в боте",
    emptyFavorites: "Добавь актрис из каталога ★",
    photo: "Фото",
    video: "Видео",
    create: "+ Создать персонажа",
    trainHint:
      "Обучение LoRA: создай персонажа → 5+ фото в боте → старт тренировки. Статус «Обучение…» обновится здесь после готовности.",
    favAdd: "В избранное",
    favRemove: "Убрать из избранного",
  },
  en: {
    tabShowcase: "Catalog",
    tabPersonal: "Personal",
    tabFavorites: "Favorites",
    showcaseHint: "Studio actresses — pre-trained LoRA",
    personalHint: "Your models after LoRA training",
    favoritesHint: "Actresses marked with ★",
    emptyPersonal: "No custom models yet — train LoRA in the bot",
    emptyFavorites: "Star actresses from the catalog",
    photo: "Photo",
    video: "Video",
    create: "+ Create character",
    trainHint:
      "LoRA training: create a character → 5+ photos in the bot → start train. «Training…» updates here when ready.",
    favAdd: "Add to favorites",
    favRemove: "Remove from favorites",
  },
} as const;

function CharacterCard({
  name,
  coverUrl,
  subtitle,
  favorited,
  showStar,
  onToggleFavorite,
  onPhoto,
  onVideo,
  photoLabel,
  videoLabel,
  starAdd,
  starRemove,
  bodySlot,
}: {
  name: string;
  coverUrl?: string | null;
  subtitle?: string;
  favorited?: boolean;
  showStar?: boolean;
  onToggleFavorite?: () => void;
  onPhoto: () => void;
  onVideo: () => void;
  photoLabel: string;
  videoLabel: string;
  starAdd: string;
  starRemove: string;
  bodySlot?: ReactNode;
}) {
  return (
    <div className="tg-portrait-card tg-portrait-card--static">
      <div className="tg-portrait-media">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="tg-portrait-img" />
        ) : (
          <div className="tg-portrait-placeholder" />
        )}
        {showStar && onToggleFavorite ? (
          <button
            type="button"
            className={`tg-fav-star${favorited ? " is-on" : ""}`}
            aria-label={favorited ? starRemove : starAdd}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
          >
            {favorited ? "★" : "☆"}
          </button>
        ) : null}
      </div>
      <div className="tg-portrait-meta">
        <strong>{name}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
      <div className="tg-char-actions">
        <button type="button" className="tg-char-action" onClick={onPhoto}>
          📸 {photoLabel}
        </button>
        <button type="button" className="tg-char-action" onClick={onVideo}>
          🎥 {videoLabel}
        </button>
      </div>
      {bodySlot}
    </div>
  );
}

export default function TgCharactersPage() {
  const router = useRouter();
  const { status, error, profile, locale, apiFetch, refresh, sendAction } =
    useTgMiniApp();
  const u = UI[locale];
  const [tab, setTab] = useState<CharTab>("showcase");
  const [favBusy, setFavBusy] = useState<string | null>(null);

  const favoriteIds = useMemo(
    () => new Set(profile?.favoriteCastIds || []),
    [profile?.favoriteCastIds],
  );

  const personal =
    profile?.characters.filter(
      (c) => !c.isStudioCast && c.loraStatus === "lora_ready" && !c.videoRefOnly,
    ) || [];
  const training =
    profile?.characters.filter(
      (c) =>
        !c.isStudioCast &&
        c.loraStatus !== "lora_ready" &&
        !c.videoRefOnly,
    ) || [];
  const casts = profile?.casts || [];
  const favorites = casts.filter((c) => favoriteIds.has(c.id));

  const toggleFavorite = async (characterId: string) => {
    setFavBusy(characterId);
    try {
      const res = await apiFetch("/api/tg/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      if (res.ok) await refresh();
    } finally {
      setFavBusy(null);
    }
  };

  if (status === "loading") return <p className="tg-loading">…</p>;
  if (status === "error") return <p className="tg-error">{error}</p>;

  return (
    <TgShell locale={locale}>
      <div className="tg-char-tabs">
        <button
          type="button"
          className={tab === "showcase" ? "active" : ""}
          onClick={() => setTab("showcase")}
        >
          {u.tabShowcase}
        </button>
        <button
          type="button"
          className={tab === "personal" ? "active" : ""}
          onClick={() => setTab("personal")}
        >
          {u.tabPersonal}
        </button>
        <button
          type="button"
          className={tab === "favorites" ? "active" : ""}
          onClick={() => setTab("favorites")}
        >
          {u.tabFavorites}
        </button>
      </div>

      {tab === "showcase" && (
        <div className="tg-section">
          <p className="tg-muted tg-section-hint">{u.showcaseHint}</p>
          <div className="tg-portrait-grid">
            {casts.map((c) => (
              <CharacterCard
                key={c.id}
                name={c.name}
                coverUrl={c.coverUrl}
                subtitle="PeachBitch Studio"
                showStar
                favorited={favoriteIds.has(c.id)}
                onToggleFavorite={() =>
                  favBusy === c.id ? undefined : void toggleFavorite(c.id)
                }
                photoLabel={u.photo}
                videoLabel={u.video}
                starAdd={u.favAdd}
                starRemove={u.favRemove}
                onPhoto={() =>
                  router.push(
                    `/tg/photo?characterId=${encodeURIComponent(c.id)}`,
                  )
                }
                onVideo={() =>
                  router.push(
                    `/tg/video?characterId=${encodeURIComponent(c.id)}`,
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {tab === "personal" && (
        <div className="tg-section">
          <p className="tg-muted tg-section-hint">{u.personalHint}</p>
          <p className="tg-muted tg-section-hint">{u.trainHint}</p>
          <div className="tg-portrait-grid">
            {personal.length === 0 && training.length === 0 && (
              <p className="tg-muted tg-empty-grid">{u.emptyPersonal}</p>
            )}
            {personal.map((c) => (
              <CharacterCard
                key={c.id}
                name={c.name}
                coverUrl={c.coverUrl}
                subtitle="LoRA"
                photoLabel={u.photo}
                videoLabel={u.video}
                starAdd={u.favAdd}
                starRemove={u.favRemove}
                onPhoto={() =>
                  router.push(
                    `/tg/photo?characterId=${encodeURIComponent(c.id)}`,
                  )
                }
                onVideo={() =>
                  router.push(
                    `/tg/video?characterId=${encodeURIComponent(c.id)}`,
                  )
                }
                bodySlot={
                  <TgCharacterBodyEditor
                    characterId={c.id}
                    characterName={c.name}
                    locale={locale}
                    apiFetch={apiFetch}
                  />
                }
              />
            ))}
            {training.map((c) => (
              <CharacterCard
                key={c.id}
                name={c.name}
                coverUrl={c.coverUrl}
                subtitle={
                  c.loraStatus === "lora_training" ? "Обучение…" : "Lookbook"
                }
                photoLabel={u.photo}
                videoLabel={u.video}
                starAdd={u.favAdd}
                starRemove={u.favRemove}
                onPhoto={() =>
                  sendAction({ action: "select_character", characterId: c.id })
                }
                onVideo={() =>
                  router.push(
                    `/tg/video?characterId=${encodeURIComponent(c.id)}`,
                  )
                }
                bodySlot={
                  <TgCharacterBodyEditor
                    characterId={c.id}
                    characterName={c.name}
                    locale={locale}
                    apiFetch={apiFetch}
                  />
                }
              />
            ))}
          </div>
          <button
            type="button"
            className="tg-primary-btn"
            style={{ marginTop: "0.75rem", width: "100%" }}
            onClick={() => sendAction({ action: "create_character" })}
          >
            {u.create}
          </button>
        </div>
      )}

      {tab === "favorites" && (
        <div className="tg-section">
          <p className="tg-muted tg-section-hint">{u.favoritesHint}</p>
          <div className="tg-portrait-grid">
            {favorites.length === 0 && (
              <p className="tg-muted tg-empty-grid">{u.emptyFavorites}</p>
            )}
            {favorites.map((c) => (
              <CharacterCard
                key={c.id}
                name={c.name}
                coverUrl={c.coverUrl}
                subtitle="★"
                showStar
                favorited
                onToggleFavorite={() =>
                  favBusy === c.id ? undefined : void toggleFavorite(c.id)
                }
                photoLabel={u.photo}
                videoLabel={u.video}
                starAdd={u.favAdd}
                starRemove={u.favRemove}
                onPhoto={() =>
                  router.push(
                    `/tg/photo?characterId=${encodeURIComponent(c.id)}`,
                  )
                }
                onVideo={() =>
                  router.push(
                    `/tg/video?characterId=${encodeURIComponent(c.id)}`,
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
    </TgShell>
  );
}
