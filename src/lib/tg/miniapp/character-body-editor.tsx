"use client";

import { useCallback, useEffect, useState } from "react";
import {
  VIDEO_BODY_LOOKBOOK_FIELD_IDS,
  bodyShapeAppearanceForPrompt,
  fieldsForGender,
  lookbookSelectValue,
  toCustomValue,
  customPayload,
  isCustomValue,
  type LookbookValues,
} from "@/lib/lookbook";

type ApiFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** Mini App figure-preset editor — saves via /api/tg/characters/lookbook. */
export function TgCharacterBodyEditor({
  characterId,
  characterName,
  locale,
  apiFetch,
}: {
  characterId: string;
  characterName: string;
  locale: "ru" | "en";
  apiFetch: ApiFetch;
}) {
  const [open, setOpen] = useState(false);
  const [lookbook, setLookbook] = useState<LookbookValues>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const bodyFields = fieldsForGender("female").filter((f) =>
    VIDEO_BODY_LOOKBOOK_FIELD_IDS.female.has(f.id),
  );

  const load = useCallback(async () => {
    setError("");
    const res = await apiFetch(
      `/api/tg/characters/lookbook?characterId=${encodeURIComponent(characterId)}`,
    );
    if (!res.ok) {
      setError(locale === "en" ? "Load failed" : "Не загрузилось");
      return;
    }
    const data = (await res.json()) as { lookbook?: LookbookValues };
    setLookbook((data.lookbook || {}) as LookbookValues);
  }, [apiFetch, characterId, locale]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  async function save() {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await apiFetch("/api/tg/characters/lookbook", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, lookbook }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error || "error"));
      setMsg(locale === "en" ? "Saved — used in next gen" : "Сохранено — уйдёт в промпт");
      setTimeout(() => setMsg(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  const preview = bodyShapeAppearanceForPrompt(lookbook, "female");

  return (
    <div className="tg-body-editor">
      <button
        type="button"
        className="tg-char-action"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? locale === "en"
            ? "Hide body"
            : "Скрыть тело"
          : locale === "en"
            ? "Body settings"
            : "Параметры тела"}
      </button>
      {open ? (
        <div className="tg-body-editor-panel">
          <p className="tg-muted" style={{ fontSize: "0.7rem", margin: "0.4rem 0" }}>
            {characterName}:{" "}
            {locale === "en"
              ? "figure preset goes into photo & video prompts (no bust/hips wording)"
              : "пресет фигуры уходит в промпт фото и видео (без слов про грудь/попу)"}
          </p>
          <div className="tg-body-fields">
            {bodyFields.map((field) => {
              const stored = lookbook[field.id] || "";
              const selectVal = lookbookSelectValue(field, stored);
              const showCustom =
                selectVal === "__custom__" || isCustomValue(stored);
              return (
                <label key={field.id} className="tg-body-field">
                  <span>{field.label}</span>
                  <select
                    value={selectVal}
                    disabled={busy}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLookbook((prev) => ({
                        ...prev,
                        [field.id]:
                          v === "__custom__"
                            ? toCustomValue(customPayload(prev[field.id]) || "")
                            : v,
                      }));
                    }}
                  >
                    {field.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                    <option value="__custom__">
                      {locale === "en" ? "Custom…" : "Своё…"}
                    </option>
                  </select>
                  {showCustom ? (
                    <input
                      placeholder="EN"
                      value={isCustomValue(stored) ? customPayload(stored) : ""}
                      disabled={busy}
                      onChange={(e) =>
                        setLookbook((prev) => ({
                          ...prev,
                          [field.id]: toCustomValue(e.target.value),
                        }))
                      }
                    />
                  ) : null}
                </label>
              );
            })}
          </div>
          {preview ? (
            <p className="tg-muted" style={{ fontSize: "0.62rem", marginTop: "0.35rem" }}>
              → {preview}
            </p>
          ) : null}
          <button
            type="button"
            className="tg-primary-btn"
            style={{ marginTop: "0.5rem", width: "100%" }}
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "…" : locale === "en" ? "Save body" : "Сохранить тело"}
          </button>
          {msg ? <p className="tg-ok">{msg}</p> : null}
          {error ? <p className="tg-error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
