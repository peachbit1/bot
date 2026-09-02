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
  }>;
  videoRefs?: Array<{ id: string; name: string; photoCount: number; videoRefOnly: boolean }>;
  casts: Array<{ id: string; name: string; coverUrl: string | null }>;
};

const UI = {
  ru: {
    openInTg: "Открой из Telegram Mini App",
    authErr: "Ошибка авторизации",
    loading: "Загрузка…",
    feed: "Лента",
    chars: "Персонажи",
    balance: "Баланс",
  },
  en: {
    openInTg: "Open from Telegram Mini App",
    authErr: "Auth failed",
    loading: "Loading…",
    feed: "Feed",
    chars: "Cast",
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
    const res = await tgFetch(initData, `/api/tg/me${q}`);
    if (!res.ok) throw new Error("profile");
    const data = (await res.json()) as TgMiniAppProfile;
    setProfile(data);
    if (data.locale === "en" || data.locale === "ru") setLocale(data.locale);
    return data;
  }, []);

  useEffect(() => {
    void (async () => {
      window.Telegram?.WebApp?.ready();
      window.Telegram?.WebApp?.expand();
      window.Telegram?.WebApp?.setHeaderColor?.("#0a0a0f");
      window.Telegram?.WebApp?.setBackgroundColor?.("#0a0a0f");

      const initData = await waitInitData();
      initDataRef.current = initData;
      if (!initData) {
        setError(UI.ru.openInTg);
        setStatus("error");
        return;
      }

      const authRes = await tgFetch(initData, "/api/tg/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (!authRes.ok) {
        setError(UI.ru.authErr);
        setStatus("error");
        return;
      }

      await tgFetch(initData, "/api/tg/miniapp-heartbeat", { method: "POST" });

      try {
        await refresh();
        setStatus("ready");
      } catch {
        setError(UI.ru.authErr);
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
  const charsActive = path === "/tg/characters" || path === "/tg/casts";

  return (
    <nav className="tg-tabbar">
      <Link href="/tg" className={feedActive ? "active" : ""}>
        <span>🎬</span>
        {u.feed}
      </Link>
      <Link href="/tg/characters" className={charsActive ? "active" : ""}>
        <span>👤</span>
        {u.chars}
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
}: {
  children: React.ReactNode;
  locale: "ru" | "en";
  balance?: number;
  title: string;
  onLangToggle?: () => void;
}) {
  const u = UI[locale];
  return (
    <div className="tg-shell">
      <header className="tg-header">
        <div className="tg-header-row">
          <h1>{title}</h1>
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
