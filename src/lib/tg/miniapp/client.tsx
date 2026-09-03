"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type TgMiniAppProfile = {
  balancePeaches: number;
  locale: "ru" | "en";
  promos: {
    studioDailyFreeReady: boolean;
    loraWelcomePhotosLeft: number;
    firstVideoDiscountAvailable: boolean;
    firstVideoDiscountPct: number;
  };
  characters: Array<{
    id: string;
    name: string;
    loraStatus: string;
    photoCount: number;
    isStudioCast: boolean;
    videoRefOnly?: boolean;
    coverUrl?: string | null;
  }>;
  videoRefs?: Array<{ id: string; name: string; photoCount: number; videoRefOnly: boolean }>;
  casts: Array<{ id: string; name: string; coverUrl: string | null }>;
};

const UI = {
  ru: {
    openInTg: "Открой из Telegram Mini App",
    authErr: "Ошибка авторизации",
    profileErr: "Не удалось загрузить профиль — открой мини-апп ещё раз",
    busyErr: "Сервер перезапускается — подожди 5 сек и открой снова",
    loading: "Загрузка…",
    feed: "Лента",
    photo: "Сделать фото",
    video: "Сделать видео",
    gallery: "Галерея",
    profile: "Профиль",
    balance: "Баланс",
  },
  en: {
    openInTg: "Open from Telegram Mini App",
    authErr: "Auth failed",
    profileErr: "Could not load profile — reopen the mini app",
    busyErr: "Server is restarting — wait 5s and open again",
    loading: "Loading…",
    feed: "Feed",
    photo: "Make photo",
    video: "Make video",
    gallery: "Gallery",
    profile: "Profile",
    balance: "Balance",
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
        sendData: (data: string) => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
      };
    };
  }
}

async function waitInitData(maxMs = 6000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const d = window.Telegram?.WebApp?.initData;
    if (d) return d;
    await new Promise((r) => setTimeout(r, 80));
  }
  return window.Telegram?.WebApp?.initData || "";
}

function tgFetch(
  initData: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (initData) headers.set("X-Tg-Init-Data", initData);
  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}

async function fetchWithRetry(
  initData: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  tries = 3,
): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await tgFetch(initData, input, init);
      last = res;
      if (res.status < 500) return res;
    } catch {
      /* network blip while Next restarts after OOM */
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  if (last) return last;
  throw new Error("network");
}

export function useTgMiniApp() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<TgMiniAppProfile | null>(null);
  const [locale, setLocale] = useState<"ru" | "en">("ru");
  const initDataRef = useRef("");

  const refresh = useCallback(async (loc?: "ru" | "en") => {
    const initData = initDataRef.current;
    if (!initData) throw new Error("no initData");
    const q = loc ? `?locale=${loc}` : "";
    const res = await fetchWithRetry(initData, `/api/tg/me${q}`);
    if (!res.ok) {
      const err = new Error(res.status >= 500 ? "busy" : "profile");
      throw err;
    }
    const data = (await res.json()) as TgMiniAppProfile;
    setProfile(data);
    if (data.locale === "en" || data.locale === "ru") setLocale(data.locale);
    return data;
  }, []);

  useEffect(() => {
    void (async () => {
      window.Telegram?.WebApp?.ready();
      window.Telegram?.WebApp?.expand();
      window.Telegram?.WebApp?.setHeaderColor?.("#070708");
      window.Telegram?.WebApp?.setBackgroundColor?.("#070708");

      const initData = await waitInitData();
      initDataRef.current = initData;
      if (!initData) {
        setError(UI.ru.openInTg);
        setStatus("error");
        return;
      }

      let authRes: Response;
      try {
        authRes = await fetchWithRetry(initData, "/api/tg/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
      } catch {
        setError(UI.ru.busyErr);
        setStatus("error");
        return;
      }

      if (!authRes.ok) {
        const detail = await authRes.text().catch(() => "");
        console.error("[tg-auth]", authRes.status, detail.slice(0, 200));
        setError(authRes.status >= 500 ? UI.ru.busyErr : UI.ru.authErr);
        setStatus("error");
        return;
      }

      void fetchWithRetry(initData, "/api/tg/miniapp-heartbeat", {
        method: "POST",
      }).catch(() => undefined);

      try {
        await refresh();
        setStatus("ready");
      } catch (e) {
        console.error("[tg-me]", e);
        const msg = e instanceof Error ? e.message : "";
        setError(msg === "busy" ? UI.ru.busyErr : UI.ru.profileErr);
        setStatus("error");
      }
    })();
  }, [refresh]);

  const apiFetch = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) =>
      tgFetch(initDataRef.current, input, init),
    [],
  );

  const sendAction = useCallback((payload: Record<string, unknown>) => {
    window.Telegram?.WebApp?.sendData(JSON.stringify(payload));
    window.Telegram?.WebApp?.close();
  }, []);

  return { status, error, profile, locale, setLocale, refresh, sendAction, apiFetch };
}

export function TgTabBar({ locale }: { locale: "ru" | "en" }) {
  const path = usePathname();
  const u = UI[locale];
  const feedActive = path === "/tg" || path === "/tg/templates";
  const photoActive =
    path.startsWith("/tg/photo") ||
    path === "/tg/characters" ||
    path === "/tg/studio-photo" ||
    path === "/tg/casts";
  const videoActive = path.startsWith("/tg/video");
  const galleryActive = path === "/tg/gallery";
  const profileActive = path.startsWith("/tg/profile") || path.startsWith("/tg/partner");

  return (
    <nav className="tg-tabbar">
      <Link href="/tg" className={feedActive ? "active" : ""}>
        <span>🎬</span>
        {u.feed}
      </Link>
      <Link href="/tg/gallery" className={galleryActive ? "active" : ""}>
        <span>🖼</span>
        {u.gallery}
      </Link>
      <Link href="/tg/photo" className={photoActive ? "active" : ""}>
        <span>📸</span>
        {u.photo}
      </Link>
      <Link href="/tg/video" className={videoActive ? "active" : ""}>
        <span>🎥</span>
        {u.video}
      </Link>
      <Link href="/tg/profile" className={profileActive ? "active" : ""}>
        <span>👤</span>
        {u.profile}
      </Link>
    </nav>
  );
}

export function TgShell({
  children,
  locale,
  balance,
  title,
  onLangToggle,
  hideTitle,
}: {
  children: React.ReactNode;
  locale: "ru" | "en";
  balance?: number;
  title: string;
  onLangToggle?: () => void;
  hideTitle?: boolean;
}) {
  const u = UI[locale];
  return (
    <div className="tg-shell">
      <header className="tg-header">
        <div className="tg-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tg/peach-logo.svg" alt="Peach Bitch" className="tg-logo" />
        </div>
        <div className="tg-header-row">
          {hideTitle ? <span /> : <h1>{title}</h1>}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {typeof balance === "number" && (
              <span className="tg-balance">
                {balance} 🍑 · {u.balance}
              </span>
            )}
            {onLangToggle && (
              <button type="button" className="tg-lang" onClick={onLangToggle}>
                {locale === "ru" ? "EN" : "RU"}
              </button>
            )}
          </div>
        </div>
      </header>
      {children}
      <TgTabBar locale={locale} />
    </div>
  );
}
