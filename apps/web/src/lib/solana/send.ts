import {
  Connection,
  VersionedTransaction,
  Keypair,
  SystemProgram,
  PublicKey,
  TransactionMessage,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getConnection, walletToKeypair, type Cluster } from "@/lib/meteora/web3-compat-boundary";
import type { StoredWallet } from "@diver/keypair-store";

export async function signAndSendTransaction(
  txBase64: string,
  wallet: StoredWallet,
  password: string,
  cluster: Cluster = "mainnet-beta"
): Promise<string> {
  const connection = getConnection(cluster);
  const keypair = walletToKeypair(wallet, password);

  const txBytes = Buffer.from(txBase64, "base64");
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([keypair]);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

  return sig;
}

export async function buildSolTransfer(params: {
  from: string;
  to: string;
  lamports: bigint;
  cluster: Cluster;
}): Promise<string> {
  const connection = getConnection(params.cluster);
  const { blockhash } = await connection.getLatestBlockhash();

  const msg = new TransactionMessage({
    payerKey: new PublicKey(params.from),
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: new PublicKey(params.from),
        toPubkey: new PublicKey(params.to),
        lamports: params.lamports,
      }),
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  return Buffer.from(tx.serialize()).toString("base64");
}

export async function buildSplTransfer(params: {
  mint: string;
  from: string;
  to: string;
  amount: bigint;
  decimals: number;
  cluster: Cluster;
}): Promise<string> {
  const connection = getConnection(params.cluster);
  const { blockhash } = await connection.getLatestBlockhash();

  const fromPubkey = new PublicKey(params.from);
  const toPubkey = new PublicKey(params.to);
  const mintPubkey = new PublicKey(params.mint);

  const fromAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
  const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey);

  const msg = new TransactionMessage({
    payerKey: fromPubkey,
    recentBlockhash: blockhash,
    instructions: [
      createTransferInstruction(fromAta, toAta, fromPubkey, params.amount, [], TOKEN_PROGRAM_ID),
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  return Buffer.from(tx.serialize()).toString("base64");
}

export async function simulateTx(
  txBase64: string,
  cluster: Cluster = "mainnet-beta"
): Promise<{ success: boolean; logs: string[]; unitsConsumed?: number }> {
  const connection = getConnection(cluster);
  const txBytes = Buffer.from(txBase64, "base64");
  const tx = VersionedTransaction.deserialize(txBytes);

  const result = await connection.simulateTransaction(tx, { sigVerify: false });
  return {
    success: !result.value.err,
    logs: result.value.logs ?? [],
    unitsConsumed: result.value.unitsConsumed ?? undefined,
  };
}
