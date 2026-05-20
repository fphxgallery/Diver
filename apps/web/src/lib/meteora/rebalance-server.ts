import { Connection, PublicKey, VersionedTransaction, TransactionMessage, SendTransactionError, ComputeBudgetProgram } from "@solana/web3.js";
import type { Keypair, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import DLMM, { StrategyType, getOrCreateATAInstruction, getTokenProgramId } from "@meteora-ag/dlmm";
import { getConnection, type Cluster } from "./web3-compat-boundary";
import { confirmByPolling } from "@/lib/solana/send";
import { fetchPrices } from "@/lib/server/portfolio-value";
import { acquireDeficitToken } from "./basket-swap";
import type { RebalanceSettings } from "./rebalance";
import type { BasketToken } from "./monitor";

const DEFAULTS: RebalanceSettings = {
  strategyType: StrategyType.Spot,
  numBins: 20,
  xWithdrawBps: 0,
  yWithdrawBps: 0,
  topUpX: new BN(0),
  topUpY: new BN(0),
  maxActiveBinSlippage: 3,
};

const PRIORITY_FEE_FLOOR = 50_000;    // microLamports per CU
const PRIORITY_FEE_CEIL = 2_000_000;

/** Adaptive priority fee from recent network fees, clamped. microLamports/CU. */
async function getPriorityFeeMicroLamports(connection: Connection): Promise<number> {
  try {
    const fees = await connection.getRecentPrioritizationFees();
    const vals = fees.map(f => f.prioritizationFee).filter(v => v > 0).sort((a, b) => a - b);
    if (vals.length === 0) return PRIORITY_FEE_FLOOR;
    const p75 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.75))];
    return Math.min(PRIORITY_FEE_CEIL, Math.max(PRIORITY_FEE_FLOOR, p75));
  } catch {
    return PRIORITY_FEE_FLOOR;
  }
}

function hasComputeBudgetIx(instructions: TransactionInstruction[], discriminator: number): boolean {
  return instructions.some(ix => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === discriminator);
}

/**
 * Build, sign, send, and confirm a tx from instructions with a FRESH blockhash and
 * a priority fee. Each call fetches its own blockhash so sequential txs never inherit
 * a stale one (the cause of "block height exceeded"). Skips adding a ComputeBudget ix
 * if the instructions already include one (avoids duplicate-instruction failures).
 */
async function signSendConfirm(
  connection: Connection,
  keypair: Keypair,
  instructions: TransactionInstruction[],
  priorityFee: number,
  unitLimit?: number
): Promise<string> {
  const budget: TransactionInstruction[] = [];
  if (unitLimit && !hasComputeBudgetIx(instructions, 2)) budget.push(ComputeBudgetProgram.setComputeUnitLimit({ units: unitLimit }));
  if (!hasComputeBudgetIx(instructions, 3)) budget.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [...budget, ...instructions],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([keypair]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmByPolling(connection, sig, lastValidBlockHeight);
  return sig;
}

export async function executeRebalanceWithKeypair(params: {
  poolAddress: string;
  positionKey: string;
  keypair: Keypair;
  settings?: Partial<RebalanceSettings>;
  topUpEnabled?: boolean;
  basketSwapEnabled?: boolean;
  basket?: BasketToken[];
  basketSwapMaxPriceImpactPct?: number;
  basketSwapMaxPctOfPosition?: number;
  jupiterApiKey?: string;
  cluster?: Cluster;
  rpcUrl?: string;
}): Promise<string[]> {
  const s: RebalanceSettings = { ...DEFAULTS, ...params.settings };
  const cluster = params.cluster ?? "mainnet-beta";
  const connection = params.rpcUrl
    ? new Connection(params.rpcUrl, "confirmed")
    : getConnection(cluster);
  const pool = await DLMM.create(connection, new PublicKey(params.poolAddress));

  const { userPositions } = await pool.getPositionsByUserAndLbPair(params.keypair.publicKey);
  const position = userPositions.find(p => p.publicKey.toBase58() === params.positionKey);
  if (!position) throw new Error("Position not found");

  // Skip empty positions — SDK throws "Assertion failed" when there are no liquidity shares
  const pd = position.positionData as { totalXAmount?: string; totalYAmount?: string };
  const isEmpty = pd.totalXAmount === "0" && pd.totalYAmount === "0";
  if (isEmpty) throw new Error("Rebalance skipped: position has no liquidity");

  // Create missing ATAs first — simulation (both simulate and rebalancePosition) fails if ATAs don't exist
  const { tokenXProgram, tokenYProgram } = getTokenProgramId(pool.lbPair);
  const [ataX, ataY] = await Promise.all([
    getOrCreateATAInstruction(connection, pool.tokenX.mint.address, params.keypair.publicKey, tokenXProgram, params.keypair.publicKey),
    getOrCreateATAInstruction(connection, pool.tokenY.mint.address, params.keypair.publicKey, tokenYProgram, params.keypair.publicKey),
  ]);
  const ataInstructions = [ataX.ix, ataY.ix].filter((ix): ix is TransactionInstruction => ix !== undefined);

  const priorityFee = await getPriorityFeeMicroLamports(connection);

  if (ataInstructions.length > 0) {
    await signSendConfirm(connection, params.keypair, ataInstructions, priorityFee, 100_000);
  }

  // Dynamic 50/50 top-up: add deficit token + withdraw equivalent excess to keep total size stable.
  // If wallet has no deficit token, skip entirely — never withdraw excess without a matching add.
  if (params.topUpEnabled || params.basketSwapEnabled) {
    try {
      const decimalsX = pool.tokenX.mint.decimals;
      const decimalsY = pool.tokenY.mint.decimals;
      const activeBin = await pool.getActiveBin();
      const priceXperY = parseFloat(activeBin.pricePerToken);

      const posX = new BN(pd.totalXAmount ?? "0").isZero() ? 0 : parseInt(pd.totalXAmount!) / 10 ** decimalsX;
      const posY = new BN(pd.totalYAmount ?? "0").isZero() ? 0 : parseInt(pd.totalYAmount!) / 10 ** decimalsY;
      const xValueInY = posX * priceXperY;
      const yValueInY = posY;

      const [xBal, yBal] = await Promise.all([
        connection.getTokenAccountBalance(ataX.ataPubKey).catch(() => null),
        connection.getTokenAccountBalance(ataY.ataPubKey).catch(() => null),
      ]);
      let walletXRaw = parseInt(xBal?.value.amount ?? "0");
      let walletYRaw = parseInt(yBal?.value.amount ?? "0");

      // Basket swap: if the deficit side's wallet balance can't cover the top-up,
      // swap from the reserve basket to acquire it, then re-read the balance.
      if (params.basketSwapEnabled && params.basket && params.basket.length > 0 && xValueInY !== yValueInY) {
        const xIsShort = xValueInY < yValueInY;
        const deficitMint = (xIsShort ? pool.tokenX : pool.tokenY).mint.address.toBase58();
        const deficitDecimals = xIsShort ? decimalsX : decimalsY;
        const fullDeficitInY = Math.abs(yValueInY - xValueInY);
        const neededRaw = xIsShort
          ? Math.floor((fullDeficitInY / priceXperY) * 10 ** decimalsX)
          : Math.floor(fullDeficitInY * 10 ** decimalsY);
        const currentRaw = xIsShort ? walletXRaw : walletYRaw;
        if (neededRaw > currentRaw) {
          const tokenXMint = pool.tokenX.mint.address.toBase58();
          const tokenYMint = pool.tokenY.mint.address.toBase58();
          const prices = await fetchPrices([tokenXMint, tokenYMint]);
          const positionValueUsd = posX * (prices[tokenXMint] ?? 0) + posY * (prices[tokenYMint] ?? 0);
          const acquired = await acquireDeficitToken({
            connection,
            keypair: params.keypair,
            owner: params.keypair.publicKey.toBase58(),
            rpcUrl: params.rpcUrl ?? connection.rpcEndpoint,
            basket: params.basket,
            deficitMint,
            deficitDecimals,
            shortfallRaw: neededRaw - currentRaw,
            positionValueUsd,
            maxPriceImpactPct: params.basketSwapMaxPriceImpactPct ?? 1,
            maxPctOfPosition: params.basketSwapMaxPctOfPosition ?? 30,
            apiKey: params.jupiterApiKey ?? "",
          });
          if (acquired) {
            console.log(`[diver] basket swap: ${acquired.source} → deficit out=${acquired.outAmount} sig=${acquired.signature.slice(0, 8)}`);
            const reread = await connection.getTokenAccountBalance(xIsShort ? ataX.ataPubKey : ataY.ataPubKey).catch(() => null);
            const newRaw = parseInt(reread?.value.amount ?? "0");
            if (xIsShort) walletXRaw = newRaw; else walletYRaw = newRaw;
          }
        }
      }

      if (xValueInY < yValueInY && walletXRaw > 0) {
        // X is short, Y is excess — add X from wallet, withdraw equivalent Y
        const fullDeficitInY = yValueInY - xValueInY;
        const xNeededRaw = Math.floor((fullDeficitInY / priceXperY) * 10 ** decimalsX);
        const xTopUp = Math.min(xNeededRaw, walletXRaw);
        if (xTopUp > 0) {
          const actualDeficitInY = (xTopUp / 10 ** decimalsX) * priceXperY;
          const yWithdrawBps = Math.min(10000, Math.floor((actualDeficitInY / yValueInY) * 10000));
          s.topUpX = new BN(xTopUp);
          s.yWithdrawBps = yWithdrawBps;
          console.log(`[diver] topUp50_50: +${(xTopUp / 10 ** decimalsX).toFixed(6)} X, withdraw ${yWithdrawBps}bps Y (~${actualDeficitInY.toFixed(4)} Y)`);
        }
      } else if (yValueInY < xValueInY && walletYRaw > 0) {
        // Y is short, X is excess — add Y from wallet, withdraw equivalent X
        const fullDeficitInY = xValueInY - yValueInY;
        const yNeededRaw = Math.floor(fullDeficitInY * 10 ** decimalsY);
        const yTopUp = Math.min(yNeededRaw, walletYRaw);
        if (yTopUp > 0) {
          const actualDeficitInY = yTopUp / 10 ** decimalsY;
          const xWithdrawBps = Math.min(10000, Math.floor((actualDeficitInY / xValueInY) * 10000));
          s.topUpY = new BN(yTopUp);
          s.xWithdrawBps = xWithdrawBps;
          console.log(`[diver] topUp50_50: +${(yTopUp / 10 ** decimalsY).toFixed(6)} Y, withdraw ${xWithdrawBps}bps X (~${actualDeficitInY.toFixed(4)} Y equiv)`);
        }
      }
    } catch (e) {
      console.warn(`[diver] topUp50_50 calculation failed, proceeding without top-up:`, e instanceof Error ? e.message : e);
    }
  }

  let rebalanceResponse: unknown;
  try {
    rebalanceResponse = await (pool as unknown as {
      simulateRebalancePositionWithBalancedStrategy: (
        positionAddress: PublicKey,
        positionData: unknown,
        strategy: StrategyType,
        topUpX: BN,
        topUpY: BN,
        xWithdrawBps: BN,
        yWithdrawBps: BN
      ) => Promise<unknown>;
    }).simulateRebalancePositionWithBalancedStrategy(
      position.publicKey,
      position.positionData,
      s.strategyType,
      s.topUpX,
      s.topUpY,
      new BN(s.xWithdrawBps),
      new BN(s.yWithdrawBps)
    );
  } catch (e) {
    if (e instanceof SendTransactionError) {
      const logs = e.logs ?? await e.getLogs(connection).catch(() => undefined);
      if (logs?.some(l => l.includes("insufficient funds"))) {
        const xSym = pool.tokenX.mint.address.toBase58().slice(0, 8);
        const ySym = pool.tokenY.mint.address.toBase58().slice(0, 8);
        throw new Error(`Rebalance skipped: wallet lacks tokens for deposit (${xSym}… / ${ySym}…). Position is likely single-sided — wallet needs both tokens to rebalance into a balanced range.`);
      }
      throw new Error(`Simulation failed. Logs:\n${logs?.join("\n") ?? e.message}`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? (e.stack ?? "") : "";
    console.error(`[diver] simulateRebalance assertion — pool=${params.poolAddress} pos=${params.positionKey}\nmsg: ${msg}\nstack: ${stack}`);
    if (msg.toLowerCase().includes("assertion failed")) {
      throw new Error(`Rebalance skipped: SDK assertion failed — position may be empty or in an invalid state (${msg})`);
    }
    throw e;
  }

  const { initBinArrayInstructions, rebalancePositionInstruction } = await (pool as unknown as {
    rebalancePosition: (
      response: unknown,
      maxActiveBinSlippage: BN
    ) => Promise<{
      initBinArrayInstructions: TransactionInstruction[];
      rebalancePositionInstruction: TransactionInstruction[];
    }>;
  }).rebalancePosition(rebalanceResponse, new BN(s.maxActiveBinSlippage));

  // Send inline, each with its own fresh blockhash + priority fee, and confirm before
  // moving on. Returns landed signatures.
  const sigs: string[] = [];
  if (initBinArrayInstructions.length > 0) {
    sigs.push(await signSendConfirm(connection, params.keypair, initBinArrayInstructions, priorityFee, 400_000));
  }
  sigs.push(await signSendConfirm(connection, params.keypair, rebalancePositionInstruction, priorityFee, 800_000));

  return sigs;
}
