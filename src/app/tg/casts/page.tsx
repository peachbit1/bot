"use client";

import { useCallback, useEffect, useState } from "react";

type Cast = { id: string; name: string };

export default function TgCastsPage() {
  const [casts, setCasts] = useState<Cast[]>([]);
  const [err, setErr] = useState("");
  const [locale, setLocale] = useState<"ru" | "en">("ru");

  const auth = useCallback(async () => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setErr("Открой из Telegram Mini App");
      return false;
    }
    const res = await fetch("/api/tg/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    if (!res.ok) {
      setErr("Ошибка авторизации");
      return false;
    }
    await fetch("/api/tg/miniapp-heartbeat", { method: "POST" });
    return true;
  }, []);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    void (async () => {
      const ok = await auth();
      if (!ok) return;
      const res = await fetch(`/api/tg/casts?locale=${locale}`);
      if (!res.ok) {
        setErr("Не удалось загрузить актрис");
        return;
      }
      const data = (await res.json()) as { casts: Cast[] };
      setCasts(data.casts || []);
    })();
  }, [auth, locale]);

  function pickCast(id: string) {
    window.Telegram?.WebApp?.sendData(
      JSON.stringify({ action: "pick_cast", characterId: id }),
    );
    window.Telegram?.WebApp?.close();
  }

  if (err) {
    return (
      <div className="min-h-screen bg-[#0c0c0e] p-4 text-center text-zinc-400">
        {err}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0e] p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">🎭 Актрисы студии</h1>
        <button
          type="button"
          className="rounded border border-white/20 px-2 py-1 text-xs"
          onClick={() => setLocale((l) => (l === "ru" ? "en" : "ru"))}
        >
          {locale === "ru" ? "EN" : "RU"}
        </button>
      </div>
      <p className="mb-4 text-sm text-zinc-400">
        Выбери модель для бесплатного тестового кадра. Потом — шаблон в маркетплейсе.
      </p>
      <div className="grid gap-3">
        {casts.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => pickCast(c.id)}
            className="rounded-xl border border-white/10 bg-[#121214] px-4 py-6 text-left hover:border-peach/40"
          >
            <span className="text-base font-medium">{c.name}</span>
            <span className="mt-1 block text-xs text-zinc-500">Актриса PeachBitch Studio</span>
          </button>
        ))}
      </div>
    </div>
  );
}
