import { Connection, PublicKey, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
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
      maxActiveBinSlippage: BN
    ) => Promise<{
      initBinArrayInstructions: TransactionInstruction[];
      rebalancePositionInstruction: TransactionInstruction[];
    }>;
  }).rebalancePosition(rebalanceResponse, new BN(s.maxActiveBinSlippage));

  // Ensure ATAs exist before simulation — missing ATA causes rebalancePosition simulation to fail
  const { tokenXProgram, tokenYProgram } = getTokenProgramId(pool.lbPair);
  const [ataX, ataY] = await Promise.all([
    getOrCreateATAInstruction(connection, pool.tokenX.mint.address, params.keypair.publicKey, tokenXProgram, params.keypair.publicKey),
    getOrCreateATAInstruction(connection, pool.tokenY.mint.address, params.keypair.publicKey, tokenYProgram, params.keypair.publicKey),
  ]);
  const ataInstructions = [ataX.ix, ataY.ix].filter((ix): ix is TransactionInstruction => ix !== undefined);

  // If any ATAs are missing, create them on-chain now so rebalancePosition simulation succeeds
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

  const { blockhash } = await connection.getLatestBlockhash();
  const txBase64s: string[] = [];

  if (initBinArrayInstructions.length > 0) {
    txBase64s.push(ixsToBase64(initBinArrayInstructions, params.keypair.publicKey, blockhash));
  }
  txBase64s.push(ixsToBase64(rebalancePositionInstruction, params.keypair.publicKey, blockhash));

  return txBase64s;
}
