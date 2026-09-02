"use client";

import { useState } from "react";

type Props = {
  templateId: string;
  kind: "video" | "photo";
  initialPublished?: boolean;
  initialDisplayTitle?: string;
  defaultTitle?: string;
  onUpdated?: () => void;
};

export function TgPublishControls({
  templateId,
  kind,
  initialPublished = false,
  initialDisplayTitle = "",
  defaultTitle = "",
  onUpdated,
}: Props) {
  const [published, setPublished] = useState(initialPublished);
  const [displayTitle, setDisplayTitle] = useState(
    initialDisplayTitle || defaultTitle,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const base =
    kind === "video"
      ? `/api/peach/quick-video/templates/${templateId}/tg`
      : `/api/peach/tg-photo/templates/${templateId}/tg`;

  async function publish() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayTitle: displayTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error || "ошибка"));
      setPublished(true);
      setMsg("Опубликовано в Telegram");
      onUpdated?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(base, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error || "ошибка"));
      setPublished(false);
      setMsg("Убрано из Telegram");
      onUpdated?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayTitle: displayTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error || "ошибка"));
      setMsg("Название в TG обновлено");
      onUpdated?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-2 space-y-2 rounded-lg border border-white/10 bg-[#0c0c0e] p-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Telegram
      </div>
      <label className="block text-xs">
        <span className="text-zinc-500">Название в TG</span>
        <input
          className="mt-1 w-full rounded border border-white/10 bg-[#121214] px-2 py-1 text-xs"
          value={displayTitle}
          onChange={(e) => setDisplayTitle(e.target.value)}
          placeholder={defaultTitle}
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {!published ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void publish()}
            className="rounded-full bg-peach px-2.5 py-1 text-[11px] font-medium text-black disabled:opacity-50"
          >
            {busy ? "…" : "Перенести в TG"}
          </button>
        ) : (
          <>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-950/40 px-2 py-0.5 text-[10px] text-emerald-300">
              В TG ✓
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveTitle()}
              className="rounded-full border border-white/15 px-2 py-0.5 text-[10px]"
            >
              Сохранить имя
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void unpublish()}
              className="rounded-full border border-red-400/30 px-2 py-0.5 text-[10px] text-red-300"
            >
              Убрать
            </button>
          </>
        )}
      </div>
      {msg ? <p className="text-[10px] text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-[10px] text-red-400">{err}</p> : null}
    </div>
  );
}
