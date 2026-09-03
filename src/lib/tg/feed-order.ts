export const PHOTO_SCENE_CATEGORIES = [
  { id: "sex", ru: "Секс", en: "Sex" },
  { id: "display", ru: "Демонстрация", en: "Display" },
  { id: "dirt", ru: "Грязь", en: "Messy" },
  { id: "public", ru: "Публичное место", en: "Public" },
  { id: "humiliation", ru: "Унижение", en: "Humiliation" },
] as const;

export type PhotoSceneCategoryId =
  (typeof PHOTO_SCENE_CATEGORIES)[number]["id"];

export function guessPhotoSceneCategory(title: string): PhotoSceneCategoryId | "" {
  const t = title.toLowerCase();
  if (/униж|унижен|spit|slap|humili/i.test(t)) return "humiliation";
  if (/двор|улиц|парков|обществен|public|balcony|лифт/i.test(t)) return "public";
  if (/гряз|сперм|cum|creampie|слюн|моч/i.test(t)) return "dirt";
  if (/секс|минет|член|еб[её]|трах|sex|blow|fuck|titjob|oral/i.test(t)) return "sex";
  if (/попк|сиськ|показ|демонстр|nude|flash|разде/i.test(t)) return "display";
  return "";
}

/** Newest first; never two consecutive items with the same identity when alternatives exist. */
export function orderFeedSmart<T extends { createdAt: number; identityKey: string }>(
  items: T[],
): T[] {
  const remaining = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const out: T[] = [];
  while (remaining.length) {
    const last = out[out.length - 1]?.identityKey;
    const idx =
      last && remaining.length > 1
        ? remaining.findIndex((x) => x.identityKey && x.identityKey !== last)
        : 0;
    const pickAt = idx >= 0 ? idx : 0;
    out.push(remaining.splice(pickAt, 1)[0]!);
  }
  return out;
}
