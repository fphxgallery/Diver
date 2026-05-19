export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
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
