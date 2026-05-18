import { PublicKey, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
import type { Keypair, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { getConnection, type Cluster } from "./web3-compat-boundary";
import type { RebalanceSettings } from "./rebalance";

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
}): Promise<string[]> {
  const s: RebalanceSettings = { ...DEFAULTS, ...params.settings };
  const cluster = params.cluster ?? "mainnet-beta";
  const connection = getConnection(cluster);
  const pool = await DLMM.create(connection, new PublicKey(params.poolAddress));

  const { userPositions } = await pool.getPositionsByUserAndLbPair(params.keypair.publicKey);
  const position = userPositions.find(p => p.publicKey.toBase58() === params.positionKey);
  if (!position) throw new Error("Position not found");

  const rebalanceResponse = await (pool as unknown as {
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
      maxActiveBinSlippage: number
    ) => Promise<{
      initBinArrayInstructions: TransactionInstruction[];
      rebalancePositionInstruction: TransactionInstruction[];
    }>;
  }).rebalancePosition(rebalanceResponse, s.maxActiveBinSlippage);

  const { blockhash } = await connection.getLatestBlockhash();
  const txBase64s: string[] = [];

  if (initBinArrayInstructions.length > 0) {
    txBase64s.push(ixsToBase64(initBinArrayInstructions, params.keypair.publicKey, blockhash));
  }
  txBase64s.push(ixsToBase64(rebalancePositionInstruction, params.keypair.publicKey, blockhash));

  return txBase64s;
}
