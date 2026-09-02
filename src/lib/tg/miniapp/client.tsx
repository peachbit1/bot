"use client";

import { useCallback, useEffect, useState } from "react";
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
  }>;
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

async function waitInitData(maxMs = 4000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const d = window.Telegram?.WebApp?.initData;
    if (d) return d;
    await new Promise((r) => setTimeout(r, 80));
  }
  return window.Telegram?.WebApp?.initData || "";
}

export function useTgMiniApp() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<TgMiniAppProfile | null>(null);
  const [locale, setLocale] = useState<"ru" | "en">("ru");

  const refresh = useCallback(async (loc?: "ru" | "en") => {
    const q = loc ? `?locale=${loc}` : "";
    const res = await fetch(`/api/tg/me${q}`, { credentials: "include" });
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
      if (!initData) {
        setError(UI.ru.openInTg);
        setStatus("error");
        return;
      }

      const authRes = await fetch("/api/tg/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData }),
      });
      if (!authRes.ok) {
        setError(UI.ru.authErr);
        setStatus("error");
        return;
      }

      await fetch("/api/tg/miniapp-heartbeat", {
        method: "POST",
        credentials: "include",
      });

      try {
        await refresh();
        setStatus("ready");
      } catch {
        setError(UI.ru.authErr);
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const sendAction = useCallback((payload: Record<string, unknown>) => {
    window.Telegram?.WebApp?.sendData(JSON.stringify(payload));
    window.Telegram?.WebApp?.close();
  }, []);

  return { status, error, profile, locale, setLocale, refresh, sendAction };
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
