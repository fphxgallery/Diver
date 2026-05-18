import { PublicKey, Transaction, VersionedTransaction, TransactionMessage, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { getConnection, walletToKeypair, type Cluster } from "./web3-compat-boundary";
import type { StoredWallet } from "@diver/keypair-store";

export interface RebalancePreview {
  currentBins: { min: number; max: number };
  newBins: { min: number; max: number };
  activeBinId: number;
  strategyType: StrategyType;
  estimatedXWithdrawn: string;
  estimatedYWithdrawn: string;
  estimatedXDeposited: string;
  estimatedYDeposited: string;
  claimFees: boolean;
}

export interface RebalanceSettings {
  strategyType: StrategyType;
  numBins: number;
  /** 0–10000 bps of existing X to withdraw before re-deposit */
  xWithdrawBps: number;
  /** 0–10000 bps of existing Y to withdraw before re-deposit */
  yWithdrawBps: number;
  /** Extra X to top-up (lamports) */
  topUpX: BN;
  /** Extra Y to top-up (lamports) */
  topUpY: BN;
  maxActiveBinSlippage: number;
}

const DEFAULTS: RebalanceSettings = {
  strategyType: StrategyType.Spot,
  numBins: 20,
  xWithdrawBps: 10000,
  yWithdrawBps: 10000,
  topUpX: new BN(0),
  topUpY: new BN(0),
  maxActiveBinSlippage: 3,
};

function ixsToBase64(
  instructions: import("@solana/web3.js").TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): string {
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const vTx = new VersionedTransaction(msg);
  return Buffer.from(vTx.serialize()).toString("base64");
}

export async function simulateRebalance(params: {
  poolAddress: string;
  positionKey: string;
  wallet: StoredWallet;
  password: string;
  settings?: Partial<RebalanceSettings>;
  cluster: Cluster;
}): Promise<{ preview: RebalancePreview; rebalancePositionResponse: unknown }> {
  const s: RebalanceSettings = { ...DEFAULTS, ...params.settings };
  const connection = getConnection(params.cluster);
  const pool = await DLMM.create(connection, new PublicKey(params.poolAddress));
  const keypair = walletToKeypair(params.wallet, params.password);

  const { userPositions } = await pool.getPositionsByUserAndLbPair(keypair.publicKey);
  const position = userPositions.find(p => p.publicKey.toBase58() === params.positionKey);
  if (!position) throw new Error("Position not found");

  const activeBin = await pool.getActiveBin();
  const half = Math.floor(s.numBins / 2);
  const newMinBin = activeBin.binId - half;
  const newMaxBin = activeBin.binId + half;

  const rebalancePositionResponse = await (pool as unknown as {
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

  const sim = (rebalancePositionResponse as {
    simulationResult: {
      actualAmountXDeposited: BN;
      actualAmountYDeposited: BN;
      actualAmountXWithdrawn?: BN;
      actualAmountYWithdrawn?: BN;
    };
  }).simulationResult;

  return {
    preview: {
      currentBins: { min: position.positionData.lowerBinId, max: position.positionData.upperBinId },
      newBins: { min: newMinBin, max: newMaxBin },
      activeBinId: activeBin.binId,
      strategyType: s.strategyType,
      estimatedXWithdrawn: (sim.actualAmountXWithdrawn ?? new BN(0)).toString(),
      estimatedYWithdrawn: (sim.actualAmountYWithdrawn ?? new BN(0)).toString(),
      estimatedXDeposited: sim.actualAmountXDeposited.toString(),
      estimatedYDeposited: sim.actualAmountYDeposited.toString(),
      claimFees: true,
    },
    rebalancePositionResponse,
  };
}

export async function executeRebalance(params: {
  poolAddress: string;
  positionKey: string;
  wallet: StoredWallet;
  password: string;
  settings?: Partial<RebalanceSettings>;
  cluster: Cluster;
}): Promise<string[]> {
  const s: RebalanceSettings = { ...DEFAULTS, ...params.settings };
  const connection = getConnection(params.cluster);
  const pool = await DLMM.create(connection, new PublicKey(params.poolAddress));
  const keypair = walletToKeypair(params.wallet, params.password);

  const { userPositions } = await pool.getPositionsByUserAndLbPair(keypair.publicKey);
  const position = userPositions.find(p => p.publicKey.toBase58() === params.positionKey);
  if (!position) throw new Error("Position not found");

  const rebalancePositionResponse = await (pool as unknown as {
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

  const { initBinArrayInstructions, rebalancePositionInstruction } = await (pool as unknown as {
    rebalancePosition: (
      response: unknown,
      maxActiveBinSlippage: number,
      rentPayer?: PublicKey,
      slippage?: number
    ) => Promise<{
      initBinArrayInstructions: import("@solana/web3.js").TransactionInstruction[];
      rebalancePositionInstruction: import("@solana/web3.js").TransactionInstruction[];
    }>;
  }).rebalancePosition(rebalancePositionResponse, s.maxActiveBinSlippage);

  const { blockhash } = await connection.getLatestBlockhash();
  const txBase64s: string[] = [];

  // Init bin arrays first (if any)
  if (initBinArrayInstructions.length > 0) {
    txBase64s.push(ixsToBase64(initBinArrayInstructions, keypair.publicKey, blockhash));
  }

  // Rebalance tx
  txBase64s.push(ixsToBase64(rebalancePositionInstruction, keypair.publicKey, blockhash));

  return txBase64s;
}
