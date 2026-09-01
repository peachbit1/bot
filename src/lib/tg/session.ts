import { prisma } from "@/lib/db";

export type TgChatState =
  | "idle"
  | "awaiting_lang"
  | "awaiting_rules"
  | "awaiting_photos"
  | "awaiting_speech";

export type TgPending = {
  templateId?: string;
  templateKind?: "video" | "photo";
  pricePeaches?: number;
  title?: string;
  hasSpeech?: boolean;
  speechLine?: string;
};

export async function getTgSession(platformUserId: string) {
  return prisma.platformAccount.findUnique({
    where: {
      platform_platformUserId: { platform: "telegram", platformUserId },
    },
    include: { user: true },
  });
}

export function parsePending(raw: string): TgPending {
  try {
    return JSON.parse(raw || "{}") as TgPending;
  } catch {
    return {};
  }
}

export async function setTgSession(
  platformUserId: string,
  patch: {
    chatState?: TgChatState;
    pending?: TgPending;
    clearPending?: boolean;
  },
) {
  const acc = await prisma.platformAccount.findUnique({
    where: {
      platform_platformUserId: { platform: "telegram", platformUserId },
    },
  });
  if (!acc) return null;

  const pending = patch.clearPending
    ? {}
    : { ...parsePending(acc.pendingJson), ...(patch.pending || {}) };

  return prisma.platformAccount.update({
    where: { id: acc.id },
    data: {
      chatState: patch.chatState ?? acc.chatState,
      pendingJson: JSON.stringify(pending),
    },
  });
}

export async function enqueueTgOutbox(opts: {
  platformUserId: string;
  userId: string;
  kind: "video" | "photo" | "text" | "error";
  payload: Record<string, unknown>;
}) {
  await prisma.tgOutbox.create({
    data: {
      platformUserId: opts.platformUserId,
      userId: opts.userId,
      kind: opts.kind,
      payloadJson: JSON.stringify(opts.payload),
    },
  });
}

export async function listPendingTgOutbox(limit = 20) {
  return prisma.tgOutbox.findMany({
    where: { sentAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function markTgOutboxSent(id: string) {
  await prisma.tgOutbox.update({
    where: { id },
    data: { sentAt: new Date() },
  });
}
