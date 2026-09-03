/**
 * Attach the viewer's character to a photo template scene (lookbook and/or LoRA).
 */
import {
  assembleLockedStillPrompt,
  characterIdentityLock,
} from "@/lib/character-identity";
import { sanitizeTemplateScenePrompt } from "@/lib/template-scene";

export async function composePhotoTemplatePromptForCharacter(opts: {
  templateEditPrompt: string;
  characterIds: string[];
  /** Dual-ref: identity comes from person image — keep scene text only. */
  sceneOnly?: boolean;
  authorNames?: string[];
  authorTriggers?: string[];
  clothed?: boolean;
}): Promise<string> {
  const scene = sanitizeTemplateScenePrompt(opts.templateEditPrompt, {
    authorNames: opts.authorNames,
    authorTriggers: opts.authorTriggers,
  });

  if (opts.sceneOnly || !opts.characterIds.length) {
    return [
      "SCENE LOCK (pose, camera, location, action, wardrobe only — do not invent hair, face, or body identity):",
      scene,
      "Identity (face, hair, body) must come only from the selected character / reference image. Ignore any leftover appearance traits.",
    ].join(" ");
  }

  const identity = await characterIdentityLock(opts.characterIds, {
    skipIntimate: !!opts.clothed,
  });
  return assembleLockedStillPrompt({
    identity,
    scene,
  });
}
