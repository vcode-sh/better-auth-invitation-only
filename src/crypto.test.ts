import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateInviteCode,
  hashInviteCode,
  hashInviteCodeAsync,
  hasNodeCrypto,
} from "./crypto";

describe("hasNodeCrypto", () => {
  it("returns true in Node.js environment", () => {
    expect(hasNodeCrypto()).toBe(true);
  });
});

describe("hashInviteCode (sync)", () => {
  it("returns a 64-char hex SHA-256 hash", () => {
    const hash = hashInviteCode("test-code");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const a = hashInviteCode("same-input");
    const b = hashInviteCode("same-input");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    const a = hashInviteCode("code-a");
    const b = hashInviteCode("code-b");
    expect(a).not.toBe(b);
  });

  it("matches native node:crypto output", () => {
    const code = "verify-against-native";
    const expected = createHash("sha256").update(code).digest("hex");
    expect(hashInviteCode(code)).toBe(expected);
  });

  it("handles empty string", () => {
    const hash = hashInviteCode("");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles unicode input", () => {
    const hash = hashInviteCode("\u{1F600}\u{1F525}");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashInviteCodeAsync", () => {
  it("returns the same result as sync version", async () => {
    const code = "async-test-code";
    const syncResult = hashInviteCode(code);
    const asyncResult = await hashInviteCodeAsync(code);
    expect(asyncResult).toBe(syncResult);
  });

  it("returns a 64-char hex SHA-256 hash", async () => {
    const hash = await hashInviteCodeAsync("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles empty string", async () => {
    const hash = await hashInviteCodeAsync("");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("generateInviteCode", () => {
  it("generates a 32-char hex string by default (16 bytes)", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates different codes each time", () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generateInviteCode())
    );
    expect(codes.size).toBe(100);
  });

  it("respects custom byte length", () => {
    const code = generateInviteCode(8);
    expect(code).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles 1 byte", () => {
    const code = generateInviteCode(1);
    expect(code).toMatch(/^[0-9a-f]{2}$/);
  });

  it("handles 32 bytes (64 hex chars)", () => {
    const code = generateInviteCode(32);
    expect(code).toMatch(/^[0-9a-f]{64}$/);
  });
});
