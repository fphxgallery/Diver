import { Connection, PublicKey, VersionedTransaction, TransactionMessage, SendTransactionError } from "@solana/web3.js";
import type { Keypair, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import DLMM, { StrategyType, getOrCreateATAInstruction, getTokenProgramId } from "@meteora-ag/dlmm";
import { getConnection, type Cluster } from "./web3-compat-boundary";
import type { RebalanceSettings } from "./rebalance";

const DEFAULTS: RebalanceSettings = {
  strategyType: StrategyType.Spot,
  numBins: 20,
  xWithdrawBps: 0,
  yWithdrawBps: 0,
  topUpX: new BN(0),
  topUpY: new BN(0),
  maxActiveBinSlippage: 3,
};

function ixsToBase64(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): string {
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64");
}

export async function executeRebalanceWithKeypair(params: {
  poolAddress: string;
  positionKey: string;
  keypair: Keypair;
  settings?: Partial<RebalanceSettings>;
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
    if (msg.toLowerCase().includes("assertion failed")) {
      throw new Error(`Rebalance skipped: SDK assertion failed — position may be empty or in an invalid state (${msg})`);
    }
    throw e;
  }

  // Create missing ATAs before rebalancePosition — it simulates on-chain and will fail if ATAs don't exist
  const { tokenXProgram, tokenYProgram } = getTokenProgramId(pool.lbPair);
  const [ataX, ataY] = await Promise.all([
    getOrCreateATAInstruction(connection, pool.tokenX.mint.address, params.keypair.publicKey, tokenXProgram, params.keypair.publicKey),
    getOrCreateATAInstruction(connection, pool.tokenY.mint.address, params.keypair.publicKey, tokenYProgram, params.keypair.publicKey),
  ]);
  const ataInstructions = [ataX.ix, ataY.ix].filter((ix): ix is TransactionInstruction => ix !== undefined);

  if (ataInstructions.length > 0) {
    const { blockhash: ataBlockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const ataTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: params.keypair.publicKey,
        recentBlockhash: ataBlockhash,
        instructions: ataInstructions,
      }).compileToV0Message()
    );
    ataTx.sign([params.keypair]);
    const ataSig = await connection.sendRawTransaction(ataTx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction({ signature: ataSig, blockhash: ataBlockhash, lastValidBlockHeight }, "confirmed");
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

  const { blockhash } = await connection.getLatestBlockhash();
  const txBase64s: string[] = [];

  if (initBinArrayInstructions.length > 0) {
    txBase64s.push(ixsToBase64(initBinArrayInstructions, params.keypair.publicKey, blockhash));
  }
  txBase64s.push(ixsToBase64(rebalancePositionInstruction, params.keypair.publicKey, blockhash));

  return txBase64s;
}
