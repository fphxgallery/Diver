export interface StoredWallet {
  id: string;
  name: string;
  publicKey: string;
  keystore: Keystore;
  createdAt: number;
  derivationPath?: string;
  /** Profile picture as a data URL (PNG/JPEG/WebP, base64-encoded). Stored in localStorage. */
  avatar?: string;
}

export interface Keystore {
  /** AES-256-GCM ciphertext (hex) */
  ciphertext: string;
  /** IV (hex, 12 bytes) */
  iv: string;
  /** Salt for PBKDF2 (hex, 32 bytes) */
  salt: string;
  /** PBKDF2 iterations */
  iterations: number;
}
