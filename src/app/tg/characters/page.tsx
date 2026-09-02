"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TgShell, useTgMiniApp } from "@/lib/tg/miniapp/client";

type CharTab = "showcase" | "personal";

const UI = {
  ru: {
    title: "👤 Персонажи",
    tabShowcase: "Витрина",
    tabPersonal: "Личные",
    showcaseHint: "Актрисы студии — LoRA уже обучена",
    personalHint: "Твои модели после обучения LoRA",
    create: "+ Создать персонажа",
    select: "Выбрать",
    cast: "В кадр",
    cabinet: "Кабинет",
    topup: "Пополнить",
    partner: "Партнёрка",
    partnerDesc: "50% с платежей приведённых юзеров",
    stats: "Статистика",
    statsDesc: "Генерации и траты — скоро",
    promoDaily: "Бесплатный кадр студии: готов",
    promoDailyWait: "Зайди в ленту, чтобы активировать",
    loraLeft: "Подарочных фото LoRA:",
    videoDisc: "Скидка на 1-е видео:",
    statusReady: "LoRA готова",
    statusTrain: "Обучение…",
    statusLookbook: "Нужно обучение",
    emptyPersonal: "Пока нет своих моделей — обучи LoRA в боте",
    videoRefs: "Модели для видео 🎬",
    videoRefsHint: "Сохранённые ref-фото — без повторной загрузки",
    promoTest: "Тест: напиши боту «НАЧИСЛИ500» → +500 🍑",
  },
  en: {
    title: "👤 Cast",
    tabShowcase: "Showcase",
    tabPersonal: "Personal",
    showcaseHint: "Studio actresses — pre-trained LoRA",
    personalHint: "Your models after LoRA training",
    create: "+ Create character",
    select: "Select",
    cast: "Use",
    cabinet: "Account",
    topup: "Top up",
    partner: "Affiliate",
    partnerDesc: "50% from referred users' payments",
    stats: "Stats",
    statsDesc: "Generations & spend — coming soon",
    promoDaily: "Studio free shot: ready",
    promoDailyWait: "Open feed to activate",
    loraLeft: "LoRA welcome photos:",
    videoDisc: "First video discount:",
    statusReady: "LoRA ready",
    statusTrain: "Training…",
    statusLookbook: "Needs training",
    emptyPersonal: "No custom models yet — train LoRA in the bot",
    videoRefs: "Video models 🎬",
    videoRefsHint: "Saved ref photos — no re-upload",
    promoTest: "Test: message the bot «НАЧИСЛИ500» → +500 🍑",
  },
} as const;

function loraBadge(status: string, u: (typeof UI)["ru"]) {
  if (status === "lora_ready") return { text: u.statusReady, ready: true };
  if (status === "lora_training") return { text: u.statusTrain, ready: false };
  return { text: u.statusLookbook, ready: false };
}

function CharPortraitCard({
  name,
  coverUrl,
  subtitle,
  actionLabel,
  ready,
  onClick,
}: {
  name: string;
  coverUrl?: string | null;
  subtitle?: string;
  actionLabel: string;
  ready?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="tg-portrait-card" onClick={onClick}>
      <div className="tg-portrait-media">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="tg-portrait-img" />
        ) : (
          <div className="tg-portrait-placeholder" />
        )}
        <span className={`tg-portrait-action ${ready ? "ready" : ""}`}>
          {actionLabel}
        </span>
      </div>
      <div className="tg-portrait-meta">
        <strong>{name}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
    </button>
  );
}

export default function TgCharactersPage() {
  const router = useRouter();
  const { status, error, profile, locale, setLocale, sendAction, refresh } =
    useTgMiniApp();
  const u = UI[locale];
  const [tab, setTab] = useState<CharTab>("showcase");

  if (status === "loading") return <p className="tg-loading">…</p>;
  if (status === "error") return <p className="tg-error">{error}</p>;

  const personal =
    profile?.characters.filter(
      (c) => !c.isStudioCast && c.loraStatus === "lora_ready",
    ) || [];
  const training =
    profile?.characters.filter(
      (c) =>
        !c.isStudioCast &&
        c.loraStatus !== "lora_ready" &&
        !c.videoRefOnly,
    ) || [];
  const promos = profile?.promos;

  return (
    <TgShell
      locale={locale}
      title={u.title}
      balance={profile?.balancePeaches}
      onLangToggle={() => setLocale(locale === "ru" ? "en" : "ru")}
    >
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
      </div>

      {tab === "showcase" ? (
        <div className="tg-section">
          <p className="tg-muted tg-section-hint">{u.showcaseHint}</p>
          <div className="tg-portrait-grid">
            {(profile?.casts || []).map((c) => (
              <CharPortraitCard
                key={c.id}
                name={c.name}
                coverUrl={c.coverUrl}
                subtitle="PeachBitch Studio"
                actionLabel={u.cast}
                onClick={() =>
                  router.push(
                    `/tg/studio-photo?castId=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.name)}`,
                  )
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="tg-section">
          <p className="tg-muted tg-section-hint">{u.personalHint}</p>
          <div className="tg-portrait-grid">
            {personal.length === 0 && training.length === 0 && (
              <p className="tg-muted tg-empty-grid">{u.emptyPersonal}</p>
            )}
            {personal.map((c) => {
              const b = loraBadge(c.loraStatus, u);
              return (
                <CharPortraitCard
                  key={c.id}
                  name={c.name}
                  coverUrl={c.coverUrl}
                  subtitle={b.text}
                  actionLabel={u.select}
                  ready={b.ready}
                  onClick={() =>
                    sendAction({ action: "select_character", characterId: c.id })
                  }
                />
              );
            })}
            {training.map((c) => {
              const b = loraBadge(c.loraStatus, u);
              return (
                <CharPortraitCard
                  key={c.id}
                  name={c.name}
                  coverUrl={c.coverUrl}
                  subtitle={b.text}
                  actionLabel={b.text}
                  onClick={() =>
                    sendAction({ action: "select_character", characterId: c.id })
                  }
                />
              );
            })}
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

      {(profile?.videoRefs?.length ?? 0) > 0 && (
        <div className="tg-section">
          <h2>{u.videoRefs}</h2>
          <p className="tg-muted tg-section-hint">{u.videoRefsHint}</p>
          <div className="tg-portrait-grid tg-portrait-grid--compact">
            {profile!.videoRefs!.map((c) => (
              <CharPortraitCard
                key={c.id}
                name={`🎬 ${c.name}`}
                actionLabel={u.select}
                subtitle={`📸 ${c.photoCount}`}
                onClick={() => router.push("/tg")}
              />
            ))}
          </div>
        </div>
      )}

      <div className="tg-section">
        <div className="tg-settings">
          <h2>{u.cabinet}</h2>
          <div className="tg-settings-row">
            <span>🍑 {profile?.balancePeaches ?? 0}</span>
            <button type="button" onClick={() => sendAction({ action: "topup" })}>
              {u.topup}
            </button>
          </div>
          <div className="tg-settings-row">
            <span style={{ fontSize: "0.78rem", color: "var(--tg-muted)" }}>
              {u.promoTest}
            </span>
          </div>
          {promos && (
            <>
              <div className="tg-settings-row">
                <span>
                  {promos.studioDailyFreeReady ? u.promoDaily : u.promoDailyWait}
                </span>
              </div>
              {promos.loraWelcomePhotosLeft > 0 && (
                <div className="tg-settings-row">
                  <span>
                    {u.loraLeft} {promos.loraWelcomePhotosLeft}
                  </span>
                </div>
              )}
              {promos.firstVideoDiscountAvailable && (
                <div className="tg-settings-row">
                  <span>
                    {u.videoDisc} −{promos.firstVideoDiscountPct}%
                  </span>
                </div>
              )}
            </>
          )}
          <div className="tg-settings-row">
            <button type="button" onClick={() => router.push("/tg/partner")}>
              {u.partner} →
            </button>
          </div>
          <div className="tg-settings-row">
            <div>
              <small style={{ color: "var(--tg-muted)" }}>{u.partnerDesc}</small>
            </div>
          </div>
          <div className="tg-settings-row">
            <div>
              <div>{u.stats}</div>
              <small style={{ color: "var(--tg-muted)" }}>{u.statsDesc}</small>
            </div>
          </div>
          <div className="tg-settings-row">
            <button
              type="button"
              className="tg-lang"
              onClick={() => {
                const next = locale === "ru" ? "en" : "ru";
                setLocale(next);
                void refresh(next);
              }}
            >
              {locale === "ru" ? "🇺🇸 English" : "🇷🇺 Русский"}
            </button>
          </div>
        </div>
      </div>
    </TgShell>
  );
}
