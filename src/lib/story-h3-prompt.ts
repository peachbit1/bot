/**
 * MiniMax H3 Full-Reference story prompts (from Grok) for Ref2V.
 * Keeps Grok's summary / retention / detailed_description / soundscape,
 * but rebuilds subject_definitions from Peach picture slots so identity
 * always maps to the user's photos (Picture 1–3, etc.).
 */
import {
  effectivePictureIndex,
  normalizeRefPrompt,
  remapPictureTags,
  roleDefHint,
  slotRoleOf,
  type QuickVideoImageSlot,
  type QuickVideoSlotRole,
} from "@/lib/quick-video-prompt";

const SECTION_KEYS = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "overall_soundscape",
  "non_diegetic_music",
] as const;

function splitH3Sections(raw: string): Record<string, string> {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const out: Record<string, string> = {};
  if (!text) return out;

  const re =
    /^(subject_definitions|summary|retention_analysis|detailed_description|overall_soundscape|non_diegetic_music)\s*:\s*$/gim;
  const matches = [...text.matchAll(re)];
  if (!matches.length) {
    out.detailed_description = text;
    return out;
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const key = m[1]!.toLowerCase();
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    out[key] = text.slice(start, end).trim();
  }
  return out;
}

function buildSlotDefinitions(
  imageSlots: QuickVideoImageSlot[],
  remap?: Map<number, number>,
): string[] {
  return imageSlots.map((slot, i) => {
    const n = effectivePictureIndex(slot.pictureIndex ?? i + 1, remap);
    const role = slotRoleOf(slot);
    if (role === "identity") {
      const who =
        slot.characterName?.trim() || slot.label?.trim() || `Subject ${n}`;
      return `<Picture ${n}> is ${who}'s identity reference (face, body, hair, skin). Preserve recognizable facial identity, body proportions, hair, and skin from this picture. Do not invent a different appearance.`;
    }
    if (role === "location") {
      const label = slot.label?.trim();
      return `<Picture ${n}> is the mandatory environment/location reference${label ? ` (${label})` : ""} — match outdoor/indoor setting, architecture, scenery, weather and lighting. Do not treat this picture as identity.`;
    }
    const hint = slot.label?.trim() || roleDefHint(role as QuickVideoSlotRole);
    return `<Picture ${n}> is the ${hint}.`;
  });
}

function patchRetentionForIdentity(retention: string): string {
  const base = retention.trim();
  const identityLine =
    "<Picture 1> / identity subject (throughout): fully_preserved — facial identity, hairstyle, body proportions, age cues, and skin from the identity reference pictures remain recognizable and stable.";
  if (!base) return identityLine;
  if (/fully_preserved/i.test(base) && /identity|Picture\s*1|Subject\s*1/i.test(base)) {
    return base;
  }
  return `${identityLine}\n${base}`;
}

/**
 * Compose final Ref2V prompt from a Grok H3 dump + filled Peach slots.
 */
export function prepareStoryH3Prompt(
  userPrompt: string,
  imageSlots: QuickVideoImageSlot[],
  videoCount = 0,
  opts?: { pictureRemap?: Map<number, number> },
): string {
  let raw = normalizeRefPrompt(userPrompt.trim());
  if (opts?.pictureRemap?.size) {
    raw = remapPictureTags(raw, opts.pictureRemap);
  }

  const sections = splitH3Sections(raw);
  const defs = buildSlotDefinitions(imageSlots, opts?.pictureRemap);

  const parts: string[] = [];

  if (defs.length) {
    parts.push(`subject_definitions:\n${defs.join("\n")}`);
  } else if (sections.subject_definitions) {
    parts.push(`subject_definitions:\n${sections.subject_definitions}`);
  }

  if (videoCount > 0) {
    parts.push(
      "motion_reference:\nMatch poses, body motion, camera moves and timing from <Video 1> unless the prompt explicitly overrides. Identity still comes from the identity picture slots, not from the video faces.",
    );
  }

  const summary =
    sections.summary?.trim() ||
    "[reference generation] Generate the target video with the identity subject fully preserved from the identity reference pictures, following the staged actions and camera plan in detailed_description.";
  parts.push(`summary:\n${summary}`);

  parts.push(
    `retention_analysis:\n${patchRetentionForIdentity(sections.retention_analysis || "")}`,
  );

  const detailed =
    sections.detailed_description?.trim() ||
    (sections.subject_definitions || sections.summary
      ? ""
      : raw);
  if (detailed) {
    parts.push(`detailed_description:\n${detailed}`);
  }

  if (sections.overall_soundscape?.trim()) {
    parts.push(`overall_soundscape:\n${sections.overall_soundscape.trim()}`);
  }

  if (sections.non_diegetic_music?.trim()) {
    parts.push(`non_diegetic_music:\n${sections.non_diegetic_music.trim()}`);
  } else {
    parts.push("non_diegetic_music:\nN/A");
  }

  return parts.join("\n\n").trim();
}

export function storyH3LooksStructured(prompt: string): boolean {
  const s = splitH3Sections(prompt);
  return Boolean(
    s.detailed_description ||
      (s.summary && s.retention_analysis) ||
      SECTION_KEYS.some((k) => (s[k] || "").length > 40),
  );
}
