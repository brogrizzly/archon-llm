import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { AnchorError } from "./types.js";

export interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export class VaultError extends Error {
  readonly code: AnchorError["code"] = "VAULT_ERROR";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VaultError";
  }
}

export class Aes256GcmVault {
  private readonly key: Buffer;
  private destroyed = false;

  constructor(key: Uint8Array) {
    if (key.byteLength !== 32) {
      throw new VaultError("AES-256-GCM requires a 32-byte key.");
    }
    this.key = Buffer.from(key);
  }

  encrypt(plaintext: string, additionalData: string): EncryptedPayload {
    this.assertAvailable();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(additionalData, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    return {
      iv: iv.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    };
  }

  decrypt(
    payload: EncryptedPayload,
    additionalData: string,
  ): string {
    this.assertAvailable();
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(payload.iv, "base64url"),
      );
      decipher.setAAD(Buffer.from(additionalData, "utf8"));
      decipher.setAuthTag(Buffer.from(payload.authTag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch (error) {
      throw new VaultError("Encrypted payload authentication failed.", {
        cause: error,
      });
    }
  }

  destroy(): void {
    this.key.fill(0);
    this.destroyed = true;
  }

  private assertAvailable(): void {
    if (this.destroyed) {
      throw new VaultError("Vault key has been destroyed.");
    }
  }
}
