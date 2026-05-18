# Diver

Self-hosted Solana wallet manager and Meteora DLMM liquidity position tool.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Solana](https://img.shields.io/badge/Solana-mainnet-9945FF?logo=solana)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Wallet management** — Create or import wallets via seed phrase or private key. Keys are encrypted with AES-256-GCM + PBKDF2 and stored locally. Nothing leaves your machine.
- **Token swaps** — Jupiter v6 aggregator with real-time quotes, price impact warnings, and slippage control.
- **Transfers** — Send SOL and SPL tokens with fee estimation.
- **Meteora DLMM** — Browse pools by volume/APR, open positions with Spot/Curve/Bid-Ask strategies, remove liquidity, and claim fees.
- **Position monitor** — Polls your active positions on a configurable interval. Shows range health, edge proximity, and triggers alerts.
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
```

RPC URL can also be changed at runtime from the Settings page — no rebuild needed.

## Systemd (VPS/server)

```bash
sudo bash deploy/install.sh
```

See [`deploy/`](deploy/) for the service file, nginx config, and update script.

## Security notes

- Private keys never leave the browser. Encryption happens client-side.
- Auto-rebalance requires a password cached in memory for the session — you are prompted before each rebalance unless you cache it.
- Use a private RPC endpoint in production to avoid rate limits and improve reliability.

## License

MIT
