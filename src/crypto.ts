import { createHash, randomBytes } from "node:crypto";

let _hasNodeCrypto = true;
try {
  createHash("sha256");
} catch {
  _hasNodeCrypto = false;
}

/**
 * SHA-256 hash using Node.js crypto (synchronous).
 * Works in Node.js and Bun. Throws in edge runtimes without node:crypto.
 */
export function hashInviteCode(code: string): string {
  if (!_hasNodeCrypto) {
    throw new Error(
      "Synchronous hashing requires node:crypto. Use hashInviteCodeAsync() in edge runtimes."
    );
  }
  return createHash("sha256").update(code).digest("hex");
}

/**
 * SHA-256 hash using Web Crypto API (async).
 * Works in all runtimes including edge/Cloudflare Workers.
 */
export async function hashInviteCodeAsync(code: string): Promise<string> {
  if (_hasNodeCrypto) {
    return hashInviteCode(code);
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a random hex invitation code.
 * Uses node:crypto when available, falls back to Web Crypto API.
 * @param lengthBytes Number of random bytes (output is 2x in hex chars).
 */
export function generateInviteCode(lengthBytes = 16): string {
  if (_hasNodeCrypto) {
    return randomBytes(lengthBytes).toString("hex");
  }
  const bytes = new Uint8Array(lengthBytes);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Whether the Node.js crypto module is available. */
export function hasNodeCrypto(): boolean {
  return _hasNodeCrypto;
}
