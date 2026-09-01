const API = "https://api.telegram.org/bot";

function botToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

function baseUrl(): string {
  return `${API}${botToken()}`;
}

export async function tgApi<T = unknown>(
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${baseUrl()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(json.description || method);
  return json.result as T;
}

export async function tgSendMessage(
  chatId: number | string,
  text: string,
  extra: Record<string, unknown> = {},
) {
  return tgApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

export async function tgSendPhoto(
  chatId: number | string,
  photoUrl: string,
  caption?: string,
) {
  return tgApi("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "HTML",
  });
}

export async function tgSendVideo(
  chatId: number | string,
  videoUrl: string,
  caption?: string,
) {
  return tgApi("sendVideo", {
    chat_id: chatId,
    video: videoUrl,
    caption,
    parse_mode: "HTML",
  });
}

export async function tgAnswerCallbackQuery(
  callbackQueryId: string,
  text?: string,
) {
  return tgApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: false } : {}),
  });
}

export async function tgDownloadFile(fileId: string): Promise<Buffer> {
  const file = await tgApi<{ file_path: string }>("getFile", { file_id: fileId });
  const url = `https://api.telegram.org/file/bot${botToken()}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
