# Diver

Self-hosted Solana wallet manager and Meteora DLMM liquidity position tool.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Solana](https://img.shields.io/badge/Solana-mainnet-9945FF?logo=solana)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Wallet management** — Create or import wallets via seed phrase or private key. Keys are encrypted with AES-256-GCM + PBKDF2 and stored locally. Export private key (base58) at any time. Click any wallet to view a full portfolio page showing all token holdings including Token-2022 assets.
- **Token swaps** — Jupiter v2 aggregator with real-time quotes, price impact warnings, slippage control, and 50%/Max preset buttons. Token selector shows your wallet holdings (including Token-2022 tokens) for quick selection. Configure your Jupiter API key in Settings → Integrations.
- **Transfers** — Send SOL and SPL tokens with fee estimation.
- **Meteora DLMM** — Browse pools sorted by 24h Fee/TVL ratio with token logos, open positions with Spot/Curve/Bid-Ask strategies, remove liquidity, and claim fees. Filter pools by minimum TVL from Settings. Pool address links directly to Meteora. Pool detail shows TVL, 24h volume, fees, Fee/TVL, APY, and current price. Liquidity Distribution chart shows per-bin token X/Y breakdown with stacked color-coded bars. Star any pool to add it to your watchlist — persisted in localStorage. Filter by bin step (≥ threshold) with presets. Refresh button with "last fetched Xm ago" indicator.
- **Position detail** — Each position card shows token amounts with live USD values, unclaimed fees, an in-range progress bar, and how long ago the position was last updated. Transaction errors surface inline. Solscan link auto-clears after 10 seconds.
- **Position discovery** — Connects to the LP Agent API to auto-discover all open DLMM positions for your wallet. No need to manually track pool addresses. Configure your API key in Settings → Integrations. Respects the 5 RPM rate limit with a 60-second cooldown between fetches.
- **Bin range presets** — New position dialog uses percentage-based range presets (±10%, ±25%, ±50%, ±100%) relative to the pool's bin step, so ranges are meaningful across different pools. Auto-Fill toggle automatically calculates the second token amount based on current USD prices.
- **Server monitor** — Runs in the Next.js server process — continues monitoring and auto-rebalancing even when the browser is closed. Key is decrypted client-side; only the 32-byte seed is sent over HTTPS. Uses your configured private RPC end-to-end (position fetch, transaction build, and send). Settings changes sync to the server immediately — no re-lock needed.
- **Auto-rebalance** — Automatically rebalances positions using the Meteora native rebalance instruction. Triggers: out-of-range and/or edge proximity (configurable %). Configurable strategy (Spot/Curve/Bid-Ask), bin width, and minimum position value. Optional composition filter skips rebalance when token X ratio is outside a set range (edge proximity only — out-of-range always rebalances). Server Settings panel shows live rebalance config so you can verify what the server is running. Automatically creates missing token accounts (ATAs) before rebalancing — prevents failures on positions opened single-sided. Simulation failures (e.g. insufficient funds for single-sided positions) are caught and reported clearly rather than crashing.
- **Dashboard** — SOL balance card shows live SOL price and approximate USD value. Fees Earned card uses the LP Agent revenue API with 7D / 1M toggle — lazy-loaded per period to avoid unnecessary API calls. Rebalance history in the Monitor panel is collapsible with failed-entry error details inline.

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Solana client | `@solana/kit` + `@solana/web3.js` at boundaries |
| DLMM SDK | `@meteora-ag/dlmm` |
| Swaps | Jupiter Aggregator API v2 |
| Encryption | `@noble/ciphers` AES-256-GCM + `@noble/hashes` PBKDF2 |
| State | Zustand v5 |
| UI | Tailwind v4 + shadcn/ui (Base UI) |
| Deploy | Docker + systemd |

## Quickstart

```bash
git clone https://github.com/fphxgallery/Diver.git
cd Diver
cp .env.example .env
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker

```bash
cp .env.example .env
# Pass NEXT_PUBLIC_ vars as build args — they are baked into the JS bundle at build time
docker build \
  --build-arg NEXT_PUBLIC_RPC_URL=https://your-rpc.com \
  -t diver .
docker compose up
```

## Configuration

Edit `.env`:

```env
# Use a private RPC for production (Helius, QuickNode, Triton, etc.)
NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_WS_URL=wss://api.mainnet-beta.solana.com

# Optional — Redis for caching
REDIS_URL=redis://redis:6379
```

RPC URL can also be changed at runtime from the Settings page — no rebuild needed for local dev.

## Server monitor

The server monitor runs inside the Next.js process and keeps checking your positions even when the browser tab is closed.

**How it works:**
1. Go to DLMM → Monitor → click **Unlock** under the Server Monitor panel
2. Enter your wallet password — the key is decrypted in the browser, only the 32-byte seed is sent to the server over HTTPS
3. The server holds the keypair in memory (never on disk) and auto-rebalances when triggers fire
4. Your configured RPC URL is forwarded to the server so it uses the same endpoint as the browser
5. Check interval respects Settings → Check Interval (minimum 60s server-side to avoid rate limits)
6. The key stays active until you click **Lock** or the server restarts — no TTL expiry

**Optional persistence across restarts:** Set `DIVER_SERVER_SECRET` (32 bytes / 64 hex chars — generate with `openssl rand -hex 32`) in `.env` and the server will encrypt the seed at rest under that key in `${DIVER_DATA_DIR:-./data}/monitor-keys.json`, auto-loading on next boot so auto-rebalance survives restarts. Leave unset to keep the key memory-only.

## Systemd (VPS/server)

```bash
sudo bash deploy/install.sh
```

See [`deploy/`](deploy/) for the service file, nginx config, and update script.

## Security notes

- Private keys never leave the browser unencrypted. AES-256-GCM encryption happens client-side; the password never touches the server.
- Server monitor: only a 32-byte seed is sent over HTTPS. By default the keypair is held in server memory only — never written to disk — and zeroed on lock or server restart.
- **Optional seed-at-rest:** if `DIVER_SERVER_SECRET` is set, seeds are AES-256-GCM encrypted under that secret and stored on disk so auto-rebalance survives restarts. **Caveat:** if the secret lives in the same `.env` next to the encrypted blob, an attacker with disk access has both — this protects against backup/snapshot leaks, not full host compromise. For real defense-in-depth, inject `DIVER_SERVER_SECRET` from a secret manager (Docker secret, systemd `LoadCredential=`, KMS, prompt-at-boot) rather than committing it to `.env`.
- LP Agent API key and Jupiter API key are stored in `sessionStorage` (cleared on browser close), not persisted to disk.
- Use a private RPC endpoint in production to avoid rate limits and improve reliability.

## License

MIT
