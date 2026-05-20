import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import BN from "bn.js";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { getConnection, walletToKeypair, type Cluster } from "./web3-compat-boundary";
import type { StoredWallet } from "@diver/keypair-store";

export { StrategyType };

export interface PositionInfo {
  publicKey: string;
  lbPair: string;
  lowerBinId: number;
  upperBinId: number;
  totalXAmount: string;
  totalYAmount: string;
  feeX: string;
  feeY: string;
  lastUpdatedAt: number;
}

export interface BinData {
  binId: number;
  price: string;
  pricePerToken: string;
  xAmount: BN;
  yAmount: BN;
  supply: BN;
}

export async function getUserPositions(
  poolAddress: string,
  walletPublicKey: string,
  cluster: Cluster = "mainnet-beta",
  rpcUrl?: string
): Promise<{
  userPositions: PositionInfo[];
  activeBinId: number;
  activeBinPricePerToken: string;
  tokenXDecimals: number;
  tokenYDecimals: number;
  tokenXMint: string;
  tokenYMint: string;
}> {
  const connection = rpcUrl ? new Connection(rpcUrl, "confirmed") : getConnection(cluster);
  const pool = await DLMM.create(connection, new PublicKey(poolAddress));
  const activeBin = await pool.getActiveBin();
  const { userPositions } = await pool.getPositionsByUserAndLbPair(new PublicKey(walletPublicKey));

  const mapped: PositionInfo[] = userPositions.map(p => ({
    publicKey: p.publicKey.toBase58(),
    lbPair: poolAddress,
    lowerBinId: p.positionData.lowerBinId,
    upperBinId: p.positionData.upperBinId,
    totalXAmount: p.positionData.totalXAmount.toString(),
    totalYAmount: p.positionData.totalYAmount.toString(),
    feeX: p.positionData.feeX.toString(),
    feeY: p.positionData.feeY.toString(),
    lastUpdatedAt: p.positionData.lastUpdatedAt.toNumber(),
  }));

  return {
    userPositions: mapped,
    activeBinId: activeBin.binId,
    activeBinPricePerToken: activeBin.pricePerToken,
    tokenXDecimals: pool.tokenX.mint.decimals,
    tokenYDecimals: pool.tokenY.mint.decimals,
    tokenXMint: pool.tokenX.mint.address.toBase58(),
    tokenYMint: pool.tokenY.mint.address.toBase58(),
  };
}

export async function getPoolBins(
  poolAddress: string,
  lowerBinId: number,
  upperBinId: number,
  cluster: Cluster = "mainnet-beta"
): Promise<{ bins: BinData[]; activeBinId: number }> {
  const connection = getConnection(cluster);
  const pool = await DLMM.create(connection, new PublicKey(poolAddress));

  const { activeBin, bins } = await pool.getBinsBetweenLowerAndUpperBound(lowerBinId, upperBinId);

  return {
    bins: bins.map(b => ({
      binId: b.binId,
      price: b.price,
      pricePerToken: b.pricePerToken,
      xAmount: b.xAmount,
      yAmount: b.yAmount,
      supply: b.supply,
    })),
    activeBinId: typeof activeBin === "number" ? activeBin : pool.lbPair.activeId,
  };
}

function serializeTx(tx: Transaction | VersionedTransaction, signers: Keypair[]): string {
  if (tx instanceof Transaction) {
    tx.sign(...signers);
    return tx.serialize().toString("base64");
  }
  tx.sign(signers);
  return Buffer.from(tx.serialize()).toString("base64");
}

export async function buildCreatePosition(params: {
  poolAddress: string;
  wallet: StoredWallet;
  password: string;
  minBinId: number;
  maxBinId: number;
  totalXAmount: BN;
  totalYAmount: BN;
  strategyType: StrategyType;
  cluster: Cluster;
}): Promise<{ txs: string[]; positionKey: string }> {
  const connection = getConnection(params.cluster);
  const pool = await DLMM.create(connection, new PublicKey(params.poolAddress));
  const keypair = walletToKeypair(params.wallet, params.password);
  const newPosition = new Keypair();

  const { blockhash } = await connection.getLatestBlockhash();

  const txs = await pool.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: newPosition.publicKey,
    user: keypair.publicKey,
    totalXAmount: params.totalXAmount,
    totalYAmount: params.totalYAmount,
    strategy: {
      maxBinId: params.maxBinId,
      minBinId: params.minBinId,
      strategyType: params.strategyType,
    },
  });

  const txList = Array.isArray(txs) ? txs : [txs];
  const serialized: string[] = [];

  for (const tx of txList) {
    if (tx instanceof Transaction) {
      tx.recentBlockhash = blockhash;
      tx.feePayer = keypair.publicKey;
    }
    serialized.push(serializeTx(tx, [keypair, newPosition]));
  }

  return { txs: serialized, positionKey: newPosition.publicKey.toBase58() };
}

export async function buildRemoveLiquidity(params: {
  poolAddress: string;
  positionKey: string;
  wallet: StoredWallet;
  password: string;
  bpsToRemove?: number;
  cluster: Cluster;
}): Promise<string[]> {
  const connection = getConnection(params.cluster);
  const pool = await DLMM.create(connection, new PublicKey(params.poolAddress));
  const keypair = walletToKeypair(params.wallet, params.password);
  const { userPositions } = await pool.getPositionsByUserAndLbPair(keypair.publicKey);
  const position = userPositions.find(p => p.publicKey.toBase58() === params.positionKey);
  if (!position) throw new Error("Position not found");

  const { blockhash } = await connection.getLatestBlockhash();

  // Empty positions (no liquidity, no fees) can't go through removeLiquidity — SDK crashes.
  // Use closePositionIfEmpty instead.
  const isEmpty =
    position.positionData.totalXAmount === "0" &&
    position.positionData.totalYAmount === "0" &&
    position.positionData.feeX.isZero() &&
    position.positionData.feeY.isZero();

  if (isEmpty) {
    const tx = await pool.closePositionIfEmpty({ owner: keypair.publicKey, position });
    if (tx instanceof Transaction) {
      tx.recentBlockhash = blockhash;
      tx.feePayer = keypair.publicKey;
    }
    return [serializeTx(tx, [keypair])];
  }

  const bps = new BN(params.bpsToRemove ?? 10000);
  const txs = await pool.removeLiquidity({
    position: position.publicKey,
    user: keypair.publicKey,
    fromBinId: position.positionData.lowerBinId,
    toBinId: position.positionData.upperBinId,
    bps,
    shouldClaimAndClose: (params.bpsToRemove ?? 10000) === 10000,
  });

  const txList = Array.isArray(txs) ? txs : [txs];
  const serialized: string[] = [];

  for (const tx of txList) {
    if (tx instanceof Transaction) {
      tx.recentBlockhash = blockhash;
      tx.feePayer = keypair.publicKey;
    }
    serialized.push(serializeTx(tx, [keypair]));
  }

  return serialized;
}

export async function buildClaimFees(params: {
  poolAddress: string;
  positionKey: string;
  wallet: StoredWallet;
  password: string;
  cluster: Cluster;
}): Promise<string> {
  const connection = getConnection(params.cluster);
  const pool = await DLMM.create(connection, new PublicKey(params.poolAddress));
  const keypair = walletToKeypair(params.wallet, params.password);
  const { userPositions } = await pool.getPositionsByUserAndLbPair(keypair.publicKey);
  const position = userPositions.find(p => p.publicKey.toBase58() === params.positionKey);
  if (!position) throw new Error("Position not found");

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = await pool.claimAllSwapFee({ owner: keypair.publicKey, positions: [position] });
  const txList = Array.isArray(tx) ? tx : [tx];
  const first = txList[0];

  if (first instanceof Transaction) {
    first.recentBlockhash = blockhash;
    first.feePayer = keypair.publicKey;
  }
  return serializeTx(first, [keypair]);
}

export function getBinRangeAroundActive(activeBinId: number, numBins: number): { minBinId: number; maxBinId: number } {
  const half = Math.floor(numBins / 2);
  return { minBinId: activeBinId - half, maxBinId: activeBinId + half };
}

export function isPositionInRange(position: PositionInfo, activeBinId: number): boolean {
  return activeBinId >= position.lowerBinId && activeBinId <= position.upperBinId;
}
