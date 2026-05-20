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

## Changelog

### v1.3.5
- **Boot version log.** The server now logs `Diver server vX.Y.Z starting` at startup (container stdout + Server Logs `server.start` event), making it easy to verify which build is actually running after a deploy/rebuild.

### v1.3.4
- **Robust insufficient-funds detection.** The Meteora SDK wraps/re-throws the build-step simulation failure as a plain error, so the `insufficient funds` / `Custom:1` markers don't always live in `error.message`. Detection now also inspects the error stack, any `.logs` array, and the serialized error, and matches `custom program error: 0x1`. Previously these failures slipped past the reactive boundary in `rebalance-server` and were only caught (as a skip) by the monitor backstop — the basket swap never engaged. Now an insufficient-funds failure correctly triggers the reserve-basket swap and retry.

### v1.3.3
- **Reactive basket swap now covers the build step.** Insufficient funds for a rebalance can surface at two stages: the balanced-strategy simulate (which only computes target amounts) and `rebalancePosition()`'s internal compute-unit simulation (which actually attempts the deposit). Previously only the first was wrapped, so a single-sided position whose shortfall only appeared at build time would fail without ever attempting the basket swap. Simulate, ATA-ensure, and build are now inside one reactive boundary: an insufficient-funds failure at either stage triggers the basket swap and a single retry, and a persistent failure becomes a clean 30-minute skip.

### v1.3.2
- **Basket swap is now reactive.** Previously the reserve-basket swap ran proactively on every rebalance trigger (including edge-proximity), causing excessive swapping. It now only fires when a rebalance actually fails for insufficient funds: the monitor tries the rebalance using existing wallet tokens, and only on an insufficient-funds failure does it swap from the basket to acquire the deficit token and retry once.
- **Basket swap / top-up in server logs.** Swaps, top-ups, and their failures now appear in the Server Logs (`rebalance.swap`, `rebalance.topup`, `rebalance.swap.fail`, `rebalance.swap.retry`, `rebalance.ata`) alongside `rebalance.trigger`, instead of only stdout.
- **Top-up no longer deposits 100% of balance.** Wallet-funded top-ups cap at 99% of the balance, leaving headroom so fees/rounding/transfer-fees can't make the on-chain deposit exceed the available balance (`InsufficientFunds` / `Custom:1`). Insufficient-funds rebalance failures are now treated as a 30-minute skip instead of retrying every tick.
- **ATA re-check before rebalance build.** Re-ensures the wallet token accounts exist immediately before building the rebalance, fixing `AccountNotInitialized` (3012) when a swap (wSOL unwrap) or other operation closed an ATA after the initial creation.

### v1.3.1
- **Swap routing → Ultra mode.** `/swap/v2/order` only runs in "ultra" mode (all routers compete — Metis, JupiterZ RFQ, Dflow, OKX) when called with no optional params. We were sending `slippageBps` on every request, which demoted to "manual" mode and disabled the RFQ routers, producing far worse routes. `slippageBps` is now optional; the swap page defaults to "Auto" (Ultra) and only sends a value when you pick a manual slippage. Quote card shows the winning route (e.g. "Ultra · jupiterz").
- **Honest price impact.** Jupiter's `priceImpact` response field is unreliable — it reported 5–15% on swaps that actually filled within ~0.2% of market mid. The swap page now computes real impact as value received vs Jupiter price-v3 mid ("Price impact (vs market)"), falling back to the raw field only when a token price is unavailable. The basket auto-swap guard switched from the bogus `priceImpact` field to a market-derived minimum-output floor.
- **Rebalance transaction landing.** Auto-rebalances were failing with "Transaction expired (block height exceeded)". Two fixes: (1) server-built txs (rebalance, init-bin-array, ATA creation) now carry an adaptive priority fee derived from recent network fees; (2) each tx is sent with its own fresh blockhash instead of sharing one stale blockhash across sequentially-confirmed txs. Rebalance txs are now sent and confirmed server-side inline, returning landed signatures.

### v1.3.0
- **Reserve basket swap on rebalance deficit.** When an auto-rebalance needs a token the wallet lacks (the common out-of-range single-sided case where a balanced rebalance has no token to deposit on one side), the monitor can now swap from a configured reserve basket to acquire the deficit token, then proceed with the top-up and rebalance. New `basketSwapEnabled` setting plus a `basket` of reserve tokens with target weights.
- **Basket source selection.** The swap pulls from whichever basket token is most over its target weight, so funding a deficit also nudges the basket back toward its target allocation.
- **Guardrails.** `basketSwapMaxPriceImpactPct` (default 1%) rejects swaps that route through illiquid pools; `basketSwapMaxPctOfPosition` (default 30%) caps a single swap to a fraction of position value. Swaps fail soft — on any error the rebalance proceeds without the swap, and the existing 30-minute skip cooldown still applies.
- **Server-side Jupiter swap.** New `swapWithKeypair` (Jupiter v2 order → price-impact check → keypair sign → execute) usable by the monitor without a browser wallet. Settings page gains a "Reserve Basket Swap" editor (token search, per-token weights, guardrail inputs); Server Monitor shows a "Basket swap" status badge.
- _Known limitation:_ uses Jupiter's default SOL wrapping, so a deficit denominated in wrapped SOL won't be picked up after the swap (it unwraps to native SOL). Works as expected when the deficit is an SPL token (e.g. USDC) funded from a SOL reserve.

### v1.2.1
- **Always-on portfolio value chart.** The wallet portfolio page now shows a 30-day line chart of total value (wallet tokens + DLMM positions). History is recorded server-side by the monitor job (hourly, per unlocked wallet) so it accrues even with the browser closed, persisted to `${DIVER_DATA_DIR:-./data}/value-history.json`. The client merges server history with local snapshots. New `GET /api/value-history?owner=` endpoint.
- **Wallet portfolio layout.** Total value moved inline with the Tokens heading; DLMM positions total shown inline with its heading; per-token USD values added. Wallet profile pictures (upload, resized to 128px WebP, stored in localStorage).
- **Open DLMM Positions** section on the wallet portfolio page, with in/out-of-range status and current USD value per position.
- **Real token symbols on positions.** My Positions cards now resolve authoritative on-chain token symbols (from pool metadata) instead of falling back to `X`/`Y` when the LP Agent pair name lacks a separator.
- **RPC propagation fix.** Changing the RPC URL in Settings now pushes to the running monitor immediately (`update_rpc`) — no lock/unlock cycle needed. The Server Monitor panel displays the RPC the server is actually using, with a warning when it's still the public endpoint.
- **WebSocket 429 fix.** Transaction confirmation no longer uses the WebSocket `signatureSubscribe` (which 429'd on rate-limited endpoints). All confirmation is now HTTP polling via `getSignatureStatuses`. Removed all remaining WebSocket code paths.
- **Jupiter price API migration.** `price/v2` is dead (`Route not found`); migrated to `price/v3` (flat response, `usdPrice` field). Fixes the broken dashboard SOL price card.

### v1.2.0
- **Dynamic 50/50 top-up on auto-rebalance.** New `topUpEnabled` setting. When a position drifts single-sided, the server now tops up the deficit token from the wallet (if available) and withdraws an equivalent amount of the excess token, keeping total position value stable. Skips entirely when wallet lacks the deficit token — never withdraws excess without a matching add. Scales partial top-ups proportionally.
- **LP Agent deduplication.** Dashboard previously fired two simultaneous `getOpeningPositions` calls on mount. Consolidated into a single fetch stored on `dlmm-store`; dashboard reads from store instead of running its own query.
- **RPC burst smoothing.** Server monitor and client `loadPositions` no longer fan out all pools concurrently — serialized with 500ms / 300ms inter-pool delays to avoid RPC `Retrying after 1000ms` spam.
- **React 19 lint hardening.** Cleared 15 `eslint-plugin-react-hooks` errors (`set-state-in-effect`, `static-components`, `refs`, `impure-functions`) flagged by the strict Next 16 / React 19 rule set. Hoisted sub-components out of render bodies, replaced `Date.now()` in render with a ticking state interval, switched derived state from `useEffect + setState` to `useMemo`, and wrapped sync setState in effects via `queueMicrotask` + cancel flags. No behavioral changes — just removes cascading-render and SSR-mismatch footguns.
- **`pnpm typecheck` script** added to `apps/web/package.json`.

### v1.1.5
- **Liquidity Distribution chart — USD values.** Chart bars now represent USD value instead of raw token amounts. Fixes two bugs: incorrect `1e6` decimal divisor for all tokens (SOL has 9 decimals, not 6), and raw-amount comparison making SOL bars ~170x taller than equivalent USDC bins. Tooltip shows both token amount and USD value.

### v1.1.4
- **Server Logs layout.** Added horizontal padding and `max-w-6xl mx-auto` so the log table no longer slams the viewport edges on wide screens.
- **Log entry cap.** Server Logs page displays the 60 most recent entries per active filter. Count label shows "X of Y entries" so you can see how many are hidden.

### v1.1.3
- **Server monitor visibility fix.** Pinned log buffer, key store, and monitor state to `globalThis`. Next.js 16 turbopack standalone can duplicate server-only modules across the instrumentation runtime and route handlers; `addLog()` was writing to one buffer while `/api/logs` read from another, so Server Logs showed 0 entries even when the monitor was running.
- **Stop check_now spam.** `ServerMonitor` sync effect now gates on a stable `poolKey` (sorted joined pool addresses) with a `useRef` last-synced marker, instead of depending on the `positions` object identity that flipped on every browser poll.
- **Drop misleading 30s interval.** Server clamps to 60s minimum anyway.
- **Scheduler heartbeat logs.** New `monitor.scheduled.arm` / `.fire` / `.skip` / `.error` events let you verify the `setTimeout` chain is alive without grepping container stdout.

### v1.1.2
- Optional encrypted seed-at-rest for server monitor under `DIVER_SERVER_SECRET` (AES-256-GCM); auto-loaded on restart so auto-rebalance survives reboots.
- Versioned persisted-store envelope, atomic write via tmp+rename, in-process write lock to prevent clobbering on concurrent updates.
- Create ATAs before `rebalancePosition()` simulation to fix rebalance failures on fresh accounts.
- Docker: `/app/data` volume mount for persisted state.
- UI: top-padding polish on dashboard / wallets / swap / transfer / logs; max-width on DLMM tabs.

## License

MIT
