export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startServerMonitor } = await import("./lib/server/monitor-job");
    startServerMonitor();
  }
}
