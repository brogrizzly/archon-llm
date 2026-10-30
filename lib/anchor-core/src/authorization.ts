import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { canonicalJson } from "./canonical.js";
import type { AuthorizationClaims, SignedAuthorization } from "./types.js";

const DOMAIN_SEPARATOR = "ARCHON_ANCHOR_AUTH_V1\n";

export function authorizationSigningBytes(
  claims: AuthorizationClaims,
): Buffer {
  return Buffer.from(
    `${DOMAIN_SEPARATOR}${canonicalJson(claims)}`,
    "utf8",
  );
}

export function signAuthorization(
  claims: AuthorizationClaims,
  privateKey: string | Buffer | KeyObject,
): SignedAuthorization {
  const key =
    typeof privateKey === "string" || Buffer.isBuffer(privateKey)
      ? createPrivateKey(privateKey)
      : privateKey;
  const signature = sign(
    null,
    authorizationSigningBytes(claims),
    key,
  ).toString("base64url");
  return { ...claims, signature };
}

export function verifyAuthorizationSignature(
  authorization: SignedAuthorization,
  publicKey: string | Buffer | KeyObject,
): boolean {
  try {
    const { signature, ...claims } = authorization;
    const key =
      typeof publicKey === "string" || Buffer.isBuffer(publicKey)
        ? createPublicKey(publicKey)
        : publicKey;
    const signatureBytes = Buffer.from(signature, "base64url");
    if (signatureBytes.length !== 64) return false;
    return verify(
      null,
      authorizationSigningBytes(claims),
      key,
      signatureBytes,
    );
  } catch {
    return false;
  }
}
