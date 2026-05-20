import {
  Connection,
  VersionedTransaction,
  Keypair,
  SystemProgram,
  PublicKey,
  TransactionMessage,
  SendTransactionError,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getConnection, walletToKeypair, type Cluster } from "@/lib/meteora/web3-compat-boundary";
import type { StoredWallet } from "@diver/keypair-store";

/**
 * Confirm a transaction by polling getSignatureStatuses over HTTP instead of
 * the WebSocket signatureSubscribe used by connection.confirmTransaction().
 * Many RPCs (and the public endpoint) rate-limit or 429 the WS, so HTTP
 * polling is more robust for server-side use.
 */
export async function confirmByPolling(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  timeoutMs = 60_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      if (status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
    }
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) throw new Error("Transaction expired (block height exceeded)");
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("Transaction confirmation timed out");
}

export function signTransaction(
  txBase64: string,
  wallet: StoredWallet,
  password: string
): string {
  const keypair = walletToKeypair(wallet, password);
  const tx = VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));
  tx.sign([keypair]);
  return Buffer.from(tx.serialize()).toString("base64");
}

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

  const { lastValidBlockHeight } = await connection.getLatestBlockhash();
  await confirmByPolling(connection, sig, lastValidBlockHeight);

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

export async function signAndSendTransactionWithKeypair(
  txBase64: string,
  keypair: Keypair,
  cluster: Cluster = "mainnet-beta",
  rpcUrl?: string
): Promise<string> {
  const connection = rpcUrl ? new Connection(rpcUrl, "confirmed") : getConnection(cluster);
  const txBytes = Buffer.from(txBase64, "base64");
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([keypair]);

  try {
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    const { lastValidBlockHeight } = await connection.getLatestBlockhash();
    await confirmByPolling(connection, sig, lastValidBlockHeight);

    return sig;
  } catch (e) {
    if (e instanceof SendTransactionError) {
      const logs = e.logs ?? await e.getLogs(connection).catch(() => undefined);
      throw new Error(`Transaction failed. Logs:\n${logs?.join("\n") ?? e.message}`);
    }
    throw e;
  }
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
