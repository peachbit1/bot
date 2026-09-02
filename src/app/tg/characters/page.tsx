"use client";

import { TgShell, useTgMiniApp } from "@/lib/tg/miniapp/client";

const UI = {
  ru: {
    title: "👤 Персонажи",
    mine: "Мои модели (LoRA)",
    mineHint: "Обученные персонажи — для фото и видео",
    studio: "Актрисы студии",
    studioHint: "LoRA уже обучена — бесплатный тестовый кадр / сутки",
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
    emptyMine: "Пока нет своих моделей",
  },
  en: {
    title: "👤 Cast",
    mine: "My models (LoRA)",
    mineHint: "Trained characters for photo & video",
    studio: "Studio actresses",
    studioHint: "Pre-trained LoRA — daily free test shot",
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
    emptyMine: "No custom models yet",
  },
} as const;

function loraBadge(status: string, u: (typeof UI)["ru"]) {
  if (status === "lora_ready") return { text: u.statusReady, ready: true };
  if (status === "lora_training") return { text: u.statusTrain, ready: false };
  return { text: u.statusLookbook, ready: false };
}

export default function TgCharactersPage() {
  const { status, error, profile, locale, setLocale, sendAction, refresh } = useTgMiniApp();
  const u = UI[locale];

  if (status === "loading") return <p className="tg-loading">…</p>;
  if (status === "error") return <p className="tg-error">{error}</p>;

  const mine = profile?.characters.filter((c) => !c.isStudioCast) || [];
  const promos = profile?.promos;

  return (
    <TgShell
      locale={locale}
      title={u.title}
      balance={profile?.balancePeaches}
      onLangToggle={() => setLocale(locale === "ru" ? "en" : "ru")}
    >
      <div className="tg-section">
        <h2>{u.mine}</h2>
        <p className="tg-muted" style={{ padding: "0 0 0.65rem", textAlign: "left" }}>
          {u.mineHint}
        </p>
        <div className="tg-card-list">
          {mine.length === 0 && (
            <p className="tg-muted" style={{ padding: "0.5rem 0" }}>
              {u.emptyMine}
            </p>
          )}
          {mine.map((c) => {
            const b = loraBadge(c.loraStatus, u);
            return (
              <button
                key={c.id}
                type="button"
                className="tg-char-card"
                onClick={() => sendAction({ action: "select_character", characterId: c.id })}
              >
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    📸 {c.photoCount} · {b.text}
                  </small>
                </div>
                <span className={`badge ${b.ready ? "ready" : ""}`}>{u.select}</span>
              </button>
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

      <div className="tg-section">
        <h2>{u.studio}</h2>
        <p className="tg-muted" style={{ padding: "0 0 0.65rem", textAlign: "left" }}>
          {u.studioHint}
        </p>
        <div className="tg-card-list">
          {(profile?.casts || []).map((c) => (
            <button
              key={c.id}
              type="button"
              className="tg-char-card studio"
              onClick={() => sendAction({ action: "pick_cast", characterId: c.id })}
            >
              <div>
                <strong>{c.name}</strong>
                <small>PeachBitch Studio · LoRA</small>
              </div>
              <span className="badge">{u.cast}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tg-section">
        <div className="tg-settings">
          <h2>{u.cabinet}</h2>
          <div className="tg-settings-row">
            <span>🍑 {profile?.balancePeaches ?? 0}</span>
            <button type="button" onClick={() => sendAction({ action: "topup" })}>
              {u.topup}
            </button>
          </div>
          {promos && (
            <>
              <div className="tg-settings-row">
                <span>{promos.studioDailyFreeReady ? u.promoDaily : u.promoDailyWait}</span>
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
            <div>
              <div>{u.partner}</div>
              <small style={{ color: "#888" }}>{u.partnerDesc}</small>
            </div>
          </div>
          <div className="tg-settings-row">
            <div>
              <div>{u.stats}</div>
              <small style={{ color: "#888" }}>{u.statsDesc}</small>
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
