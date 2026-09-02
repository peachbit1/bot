import { listTgFeaturedPhotoTemplates, listTgFeaturedVideoTemplates } from "@/lib/tg/tg-catalog";
import type { TgLocale } from "@/lib/tg/i18n";
import { t, tFormat } from "@/lib/tg/i18n";
import { resolveTemplatePricePeaches } from "@/lib/tg/generation-service";
import { tgSendMessage } from "@/lib/tg/telegram-api";
import { isStudioCastCharacter, characterUsesLoraPhoto } from "@/lib/tg/studio-cast";
import {
  canUseStudioDailyFree,
} from "@/lib/tg/tg-promo";

export const GEN_CB = {
  kindPhoto: "g:k:p",
  kindVideo: "g:k:v",
  pick: (idx: number) => `g:pi:${idx}`,
  page: (page: number) => `g:pg:${page}`,
  confirm: "g:go",
  backTemplates: "g:bt",
  againPhoto: "g:ap",
  againVideo: "g:av",
  toHub: "g:hub",
} as const;

export const VID_CB = {
  pickRef: (id: string) => `vid:ref:${id}`,
  uploadNew: "vid:new",
  saveYes: (id: string) => `vid:save:${id}`,
  saveSkip: "vid:skip",
} as const;

export const OB_CB = {
  uploadChar: "ob:up",
  backName: "ob:bn",
  kindPhoto: "ob:kp",
  kindVideo: "ob:kv",
  pickStudio: (id: string) => `ob:sc:${id}`,
} as const;

export const TOPUP_CB = {
  amount: (n: number) => `tu:${n}`,
} as const;

const PAGE_SIZE = 6;

export type BotTemplateRow = {
  id: string;
  title: string;
  kind: "photo" | "video";
};

function botTemplateFilter(): string[] | null {
  const raw = process.env.TG_BOT_INLINE_TEMPLATE_IDS?.trim();
  if (!raw) return null;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function listBotInlineTemplates(
  userId: string,
  kind: "photo" | "video",
  locale: TgLocale,
): Promise<BotTemplateRow[]> {
  if (kind === "photo") {
    const rows = await listTgFeaturedPhotoTemplates(locale);
    return rows.map((r) => ({ id: r.id, title: r.title, kind: "photo" as const }));
  }
  const rows = await listTgFeaturedVideoTemplates(userId);
  const filter = botTemplateFilter();
  const mapped = rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: "video" as const,
  }));
  if (!filter) return mapped;
  const picked = mapped.filter((r) => filter.includes(r.id));
  return picked.length ? picked : mapped;
}

import { tgMiniAppUrl } from "@/lib/tg/miniapp-url";

function miniAppUrl(): string {
  return tgMiniAppUrl();
}

export function templatePickerKeyboard(
  templates: BotTemplateRow[],
  page: number,
  locale: TgLocale,
) {
  const totalPages = Math.max(1, Math.ceil(templates.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = templates.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const rows: Array<
    Array<{
      text: string;
      callback_data?: string;
      web_app?: { url: string };
    }>
  > = [];
  for (let i = 0; i < slice.length; i += 2) {
    const row: Array<{
      text: string;
      callback_data?: string;
      web_app?: { url: string };
    }> = [];
    const a = slice[i]!;
    row.push({
      text: a.title.slice(0, 40),
      callback_data: GEN_CB.pick(safePage * PAGE_SIZE + i),
    });
    const b = slice[i + 1];
    if (b) {
      row.push({
        text: b.title.slice(0, 40),
        callback_data: GEN_CB.pick(safePage * PAGE_SIZE + i + 1),
      });
    }
    rows.push(row);
  }

  if (totalPages > 1) {
    const nav: Array<{ text: string; callback_data: string }> = [];
    if (safePage > 0) nav.push({ text: t("gen_page_prev", locale), callback_data: GEN_CB.page(safePage - 1) });
    if (safePage < totalPages - 1) nav.push({ text: t("gen_page_next", locale), callback_data: GEN_CB.page(safePage + 1) });
    if (nav.length) rows.push(nav);
  }

  rows.push([
    {
      text: t("marketplace_btn", locale),
      web_app: { url: miniAppUrl() },
    },
  ]);

  return { keyboard: rows, page: safePage, totalPages };
}

export async function sendTemplatePicker(
  chatId: number,
  userId: string,
  locale: TgLocale,
  kind: "photo" | "video",
  page = 0,
) {
  const templates = await listBotInlineTemplates(userId, kind, locale);
  if (!templates.length) {
    await tgSendMessage(chatId, t("templates_empty", locale), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t("marketplace_btn", locale), web_app: { url: miniAppUrl() } }],
        ],
      },
    });
    return { templates: [], page: 0 };
  }

  const { keyboard, page: safePage } = templatePickerKeyboard(templates, page, locale);
  const kindLabel =
    kind === "photo" ? t("gen_kind_photo_label", locale) : t("gen_kind_video_label", locale);

  await tgSendMessage(chatId, tFormat("gen_pick_template", locale, { kind: kindLabel }), {
    reply_markup: { inline_keyboard: keyboard },
  });

  return { templates, page: safePage };
}

export async function resolvePickIndex(
  userId: string,
  kind: "photo" | "video",
  locale: TgLocale,
  idx: number,
): Promise<BotTemplateRow | null> {
  const templates = await listBotInlineTemplates(userId, kind, locale);
  return templates[idx] ?? null;
}

export async function templatePriceLabel(opts: {
  userId: string;
  kind: "photo" | "video";
  templateId: string;
  locale: TgLocale;
  character?: { isStudioCast?: boolean; loraStatus?: string; userId?: string } | null;
}): Promise<{
  price: number;
  label: string;
  discountApplied: boolean;
  freePhoto: boolean;
  studioDaily?: boolean;
  loraWelcome?: boolean;
}> {
  const { prisma } = await import("@/lib/db");
  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  const price = await resolveTemplatePricePeaches({
    kind: opts.kind,
    templateId: opts.templateId,
    userId: opts.userId,
  });

  if (opts.kind === "photo" && opts.character) {
    if (isStudioCastCharacter(opts.character)) {
      if (await canUseStudioDailyFree(opts.userId)) {
        return {
          price: 0,
          label: t("studio_free_daily", opts.locale),
          discountApplied: false,
          freePhoto: true,
          studioDaily: true,
        };
      }
    } else if (characterUsesLoraPhoto(opts.character)) {
      const left = user?.tgLoraWelcomePhotosLeft ?? 0;
      if (left > 0) {
        const leftNote =
          left > 1
            ? `\n${tFormat("lora_welcome_photos_left", opts.locale, { n: left })}`
            : "";
        return {
          price: 0,
          label: t("gen_confirm_free", opts.locale) + leftNote,
          discountApplied: false,
          freePhoto: true,
          loraWelcome: true,
        };
      }
    }
  }

  if (opts.kind === "video" && user && !user.tgFirstVideoDiscountUsed && price > 0) {
    const { applyFirstVideoDiscount } = await import("@/lib/tg-pricing");
    const d = applyFirstVideoDiscount(price, false);
    if (d.discountApplied) {
      return {
        price: d.peaches,
        label: tFormat("gen_confirm_discount", opts.locale, { price: d.peaches }),
        discountApplied: true,
        freePhoto: false,
      };
    }
  }

  return {
    price,
    label: tFormat("gen_confirm_price", opts.locale, { price }),
    discountApplied: false,
    freePhoto: false,
  };
}

export function successInlineKeyboard(locale: TgLocale) {
  return {
    inline_keyboard: [
      [{ text: t("gen_again_photo_btn", locale), callback_data: GEN_CB.againPhoto }],
      [{ text: t("gen_again_video_btn", locale), callback_data: GEN_CB.againVideo }],
      [{ text: t("gen_to_hub_btn", locale), callback_data: GEN_CB.toHub }],
    ],
  };
}

export function genKindInlineKeyboard(locale: TgLocale) {
  return {
    inline_keyboard: [
      [
        { text: t("gen_kind_photo_btn", locale), callback_data: GEN_CB.kindPhoto },
        { text: t("gen_kind_video_btn", locale), callback_data: GEN_CB.kindVideo },
      ],
    ],
  };
}

export function onboardKindInlineKeyboard(locale: TgLocale) {
  return {
    inline_keyboard: [
      [
        { text: t("gen_kind_photo_btn", locale), callback_data: OB_CB.kindPhoto },
        { text: t("gen_kind_video_btn", locale), callback_data: OB_CB.kindVideo },
      ],
    ],
  };
}
