# Diver

Self-hosted Solana wallet manager and Meteora DLMM liquidity position tool.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Solana](https://img.shields.io/badge/Solana-mainnet-9945FF?logo=solana)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Wallet management** — Create or import wallets via seed phrase or private key. Keys are encrypted with AES-256-GCM + PBKDF2 and stored locally. Export private key (base58) at any time.
- **Token swaps** — Jupiter v6 aggregator with real-time quotes, price impact warnings, and slippage control.
- **Transfers** — Send SOL and SPL tokens with fee estimation.
- **Meteora DLMM** — Browse pools sorted by 24h Fee/TVL ratio with token logos, open positions with Spot/Curve/Bid-Ask strategies, remove liquidity, and claim fees. Filter pools by minimum TVL from Settings. Pool address links directly to Meteora.
- **Position discovery** — Connects to the LP Agent API to auto-discover all open DLMM positions for your wallet. No need to manually track pool addresses. Configure your API key in Settings → Integrations. Respects the 5 RPM rate limit with a 60-second cooldown between fetches.
- **Bin range presets** — New position dialog uses percentage-based range presets (±10%, ±25%, ±50%, ±100%) relative to the pool's bin step, so ranges are meaningful across different pools.
- **Browser monitor** — Polls positions on a configurable interval while the tab is open. Shows range health and edge proximity.
- **Server monitor** — Runs in the Next.js server process — continues monitoring and auto-rebalancing even when you navigate away or close the tab. Key is decrypted client-side; only the seed is sent to the server over HTTPS. Uses your configured RPC URL (not just the default public endpoint).
- **Auto-rebalance** — Automatically rebalances out-of-range positions using the Meteora native rebalance instruction. Configurable strategy, bin width, and trigger conditions. Optional composition filter skips rebalance on single-sided positions — only fires when token X is within a configured % range of total position value (default 40–60%).

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Solana client | `@solana/kit` + `@solana/web3.js` at boundaries |
| DLMM SDK | `@meteora-ag/dlmm` |
| Swaps | Jupiter Aggregator API v6 |
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
6. Click **Lock** to zero and remove the key, or it expires automatically after the configured TTL

## Systemd (VPS/server)

```bash
sudo bash deploy/install.sh
```

See [`deploy/`](deploy/) for the service file, nginx config, and update script.

## Security notes

- Private keys never leave the browser unencrypted. AES-256-GCM encryption happens client-side; the password never touches the server.
- Server monitor: only a 32-byte seed is sent over HTTPS. The keypair is held in server memory only — never written to disk — and zeroed on lock or expiry.
- LP Agent API key is stored in `sessionStorage` (cleared on browser close), not persisted to disk.
- Auto-rebalance (browser mode) caches the password in memory for the session — you are prompted before each rebalance unless you cache it.
- Use a private RPC endpoint in production to avoid rate limits and improve reliability.

## License

MIT
