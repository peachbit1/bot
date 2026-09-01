export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { resumeStuckQuickVideoRuns } = await import("@/lib/quick-video");
  const n = await resumeStuckQuickVideoRuns();
  if (n > 0) {
    console.log(`[peach] quick-video startup: re-queued ${n} run(s)`);
  }
}
