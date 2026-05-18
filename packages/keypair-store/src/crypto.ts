import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import type { Keystore } from "./types";

const ITERATIONS = 210_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function deriveKey(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  return pbkdf2(sha256, password, salt, { c: iterations, dkLen: 32 });
}

export function encryptKeystore(privateKeyBytes: Uint8Array, password: string): Keystore {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = deriveKey(password, salt, ITERATIONS);
  const aes = gcm(key, iv);
  const ciphertext = aes.encrypt(privateKeyBytes);

  return {
    ciphertext: toHex(ciphertext),
    iv: toHex(iv),
    salt: toHex(salt),
    iterations: ITERATIONS,
  };
}

export function decryptKeystore(keystore: Keystore, password: string): Uint8Array {
  const salt = fromHex(keystore.salt);
  const iv = fromHex(keystore.iv);
  const ciphertext = fromHex(keystore.ciphertext);
  const key = deriveKey(password, salt, keystore.iterations);
  const aes = gcm(key, iv);
  return aes.decrypt(ciphertext);
}
