/** Base URL for TG Mini App (always /tg, not web cabinet). */
export function tgMiniAppBase(): string {
  const raw =
    process.env.TELEGRAM_MINIAPP_URL?.trim() ||
    process.env.TELEGRAM_BOT_SITE_URL?.trim() ||
    "https://bot-production-c305.up.railway.app/tg";
  let base = raw.replace(/\/tg\/templates\/?$/i, "/tg").replace(/\/$/, "");
  if (!/\/tg$/i.test(base)) {
    base = base.includes("/tg/") ? base.replace(/\/tg\/.*$/, "/tg") : `${base}/tg`;
  }
  return base;
}

export function tgMiniAppUrl(path = ""): string {
  const base = tgMiniAppBase();
  const p = path.replace(/^\//, "");
  return p ? `${base}/${p}` : base;
}

/** @deprecated use tgMiniAppUrl */
export function castsMiniAppUrl(): string {
  return tgMiniAppUrl("characters");
}
