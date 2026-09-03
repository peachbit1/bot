export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Skip on Railway by default — resume pulls gallery/GPU state and OOMs the 1GB trial box.
  if (process.env.PEACH_RESUME_QV !== "1") {
    console.log("[peach] quick-video startup resume skipped (set PEACH_RESUME_QV=1 to enable)");
    return;
  }
  const { resumeStuckQuickVideoRuns } = await import("@/lib/quick-video");
  const n = await resumeStuckQuickVideoRuns();
  if (n > 0) {
    console.log(`[peach] quick-video startup: re-queued ${n} run(s)`);
  }
}
