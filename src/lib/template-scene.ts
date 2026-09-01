/** Pull the reusable SCENE block from an author's still prompt, dropping their identity lock. */

export function sceneFromTemplateStillPrompt(stillPrompt: string, beat?: string): string {
  const raw = stillPrompt.trim();
  if (!raw) return (beat || "").trim();

  const sceneLabel = raw.match(
    /SCENE\s*\([^)]*\)\s*:\s*([\s\S]+?)(?=\s*Exactly \d+ people|\s*$)/i,
  );
  if (sceneLabel?.[1]?.trim()) {
    return cleanScene(sceneLabel[1]);
  }

  const stripped = raw
    .replace(/^[^.]*trigger[^.]*\.\s*/i, "")
    .replace(/IDENTITY LOCK[\s\S]*?(?=SCENE\b|$)/i, "")
    .replace(/PERSON_\d+\s+is[\s\S]*?every frame\.\s*/gi, "")
    .replace(/Exactly \d+ people[\s\S]*/i, "")
    .replace(/SCENE\s*\([^)]*\)\s*:\s*/i, "")
    .trim();

  return cleanScene(stripped) || beat?.trim() || raw;
}

function cleanScene(text: string): string {
  return text.replace(/\s+/g, " ").replace(/^[,.;:\s]+/, "").trim();
}
