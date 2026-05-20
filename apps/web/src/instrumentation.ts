export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    let version = "unknown";
    try {
      version = ((await import("../package.json")) as { default?: { version?: string }; version?: string }).default?.version
        ?? ((await import("../package.json")) as { version?: string }).version
        ?? "unknown";
    } catch { /* ignore */ }
    const { addLog } = await import("./lib/server/server-log");
    console.log(`[diver] Diver server v${version} starting`);
    addLog("info", "server.start", `Diver server v${version} starting`, { version });

    const { loadPersistedEntries } = await import("./lib/server/persisted-store");
    const { setKeyInMemory } = await import("./lib/server/key-store");
    const { Keypair } = await import("@solana/web3.js");
    const { DEFAULT_MONITOR_SETTINGS } = await import("./lib/meteora/monitor");

    const entries = await loadPersistedEntries();
    for (const entry of entries) {
      const keypair = Keypair.fromSeed(entry.seed);
      setKeyInMemory(entry.walletId, {
        keypair,
        publicKey: entry.publicKey,
        poolAddresses: entry.poolAddresses,
        pairNames: entry.pairNames,
        rpcUrl: entry.rpcUrl,
        settings: { ...DEFAULT_MONITOR_SETTINGS, ...entry.settings },
      });
    }
    if (entries.length > 0) {
      console.log(`[diver] Auto-loaded ${entries.length} persisted wallet(s)`);
    } else if (!process.env.DIVER_SERVER_SECRET) {
      console.warn("[diver] DIVER_SERVER_SECRET not set — wallet state will not persist across restarts");
    }

    const { startServerMonitor } = await import("./lib/server/monitor-job");
    startServerMonitor();
  }
}
