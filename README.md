# Diver

Self-hosted Solana wallet manager and Meteora DLMM liquidity position tool.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Solana](https://img.shields.io/badge/Solana-mainnet-9945FF?logo=solana)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Wallet management** — Create or import wallets via seed phrase or private key. Keys are encrypted with AES-256-GCM + PBKDF2 and stored locally. Export private key (base58) at any time.
- **Token swaps** — Jupiter v6 aggregator with real-time quotes, price impact warnings, and slippage control.
- **Transfers** — Send SOL and SPL tokens with fee estimation.
- **Meteora DLMM** — Browse pools by volume/APR, open positions with Spot/Curve/Bid-Ask strategies, remove liquidity, and claim fees.
- **Browser monitor** — Polls positions on a configurable interval while the tab is open. Shows range health and edge proximity.
- **Server monitor** — Runs in the Next.js server process — continues monitoring and auto-rebalancing even when you navigate away or close the tab. Key is decrypted client-side; only the seed is sent to the server over HTTPS.
- **Auto-rebalance** — Automatically rebalances out-of-range positions using the Meteora native rebalance instruction. Configurable strategy, bin width, and trigger conditions.

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
docker compose up --build
```

## Configuration

Edit `.env`:

```env
# Use a private RPC for production (Helius, QuickNode, Triton, etc.)
NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_WS_URL=wss://api.mainnet-beta.solana.com

# Optional — Redis for caching
REDIS_URL=redis://redis:6379

# Server monitor PIN — protects /api/unlock, /api/lock, /api/monitor
# Leave empty to disable auth (dev only). Set a strong random string in production.
DIVER_PIN=your-secret-pin
NEXT_PUBLIC_DIVER_PIN=your-secret-pin  # must match DIVER_PIN
```

RPC URL can also be changed at runtime from the Settings page — no rebuild needed.

## Server monitor

The server monitor runs inside the Next.js process and keeps checking your positions even when the browser tab is closed.

**How it works:**
1. Go to DLMM → Monitor → click **Unlock** under the Server Monitor panel
2. Enter your wallet password — the key is decrypted in the browser, only the 32-byte seed is sent to the server over HTTPS
3. The server holds the keypair in memory (never on disk) and auto-rebalances when triggers fire
4. Click **Lock** to zero and remove the key, or it expires automatically after the configured TTL

**Securing the API:** Set `DIVER_PIN` and `NEXT_PUBLIC_DIVER_PIN` in `.env` to the same random string. All `/api/*` routes require `Authorization: Bearer <pin>`.

## Systemd (VPS/server)

```bash
sudo bash deploy/install.sh
```

See [`deploy/`](deploy/) for the service file, nginx config, and update script.

## Security notes

- Private keys never leave the browser unencrypted. AES-256-GCM encryption happens client-side; the password never touches the server.
- Server monitor: only a 32-byte seed is sent over HTTPS. The keypair is held in server memory only — never written to disk — and zeroed on lock or expiry.
- Set `DIVER_PIN` in production to protect the server monitor API.
- Auto-rebalance (browser mode) caches the password in memory for the session — you are prompted before each rebalance unless you cache it.
- Use a private RPC endpoint in production to avoid rate limits and improve reliability.

## License

MIT
