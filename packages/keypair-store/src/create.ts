import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import { encryptKeystore } from "./crypto";
import type { StoredWallet } from "./types";

function uuid() { return globalThis.crypto.randomUUID(); }

const DEFAULT_DERIVATION_PATH = "m/44'/501'/0'/0'";

export function createWallet(name: string, password: string): {
  wallet: StoredWallet;
  mnemonic: string;
} {
  const mnemonic = bip39.generateMnemonic(256);
  const wallet = importFromMnemonic(name, mnemonic, password);
  return { wallet, mnemonic };
}

export function importFromMnemonic(
  name: string,
  mnemonic: string,
  password: string,
  derivationPath = DEFAULT_DERIVATION_PATH
): StoredWallet {
  if (!bip39.validateMnemonic(mnemonic)) throw new Error("Invalid mnemonic");

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const { key } = derivePath(derivationPath, seed.toString("hex"));
  const keypair = Keypair.fromSeed(key);

  return {
    id: uuid(),
    name,
    publicKey: keypair.publicKey.toBase58(),
    keystore: encryptKeystore(keypair.secretKey.slice(0, 32), password),
    createdAt: Date.now(),
    derivationPath,
  };
}

export function importFromPrivateKeyBytes(
  name: string,
  secretKey: Uint8Array,
  password: string
): StoredWallet {
  const keypair = Keypair.fromSecretKey(secretKey);

  return {
    id: uuid(),
    name,
    publicKey: keypair.publicKey.toBase58(),
    keystore: encryptKeystore(keypair.secretKey.slice(0, 32), password),
    createdAt: Date.now(),
  };
}
