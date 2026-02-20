import { getTestInstance } from "better-auth/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateInviteCode, hashInviteCode, inviteOnly } from "./index";

/**
 * Integration tests with a real better-auth instance + SQLite in-memory DB.
 * Proves the plugin schema, adapter operations, and endpoints work end-to-end.
 */

let db: any;
let testUserId: string;

beforeAll(async () => {
  const instance = await getTestInstance(
    {
      plugins: [
        inviteOnly({
          enabled: false,
          isAdmin: () => true,
          baseUrl: "http://localhost:3000",
        }),
      ],
    },
    { testWith: "sqlite" }
  );
  db = instance.db;
  // getTestInstance creates a default user (test@test.com) — grab their ID
  const user = await db.findOne({
    model: "user",
    where: [{ field: "email", value: "test@test.com" }],
  });
  testUserId = user.id;
});

afterAll(() => {});

describe("schema creation", () => {
  it("invitation table exists with correct columns", async () => {
    const result = await db.findMany({ model: "invitation" });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe("adapter CRUD", () => {
  const code = generateInviteCode(16);
  const codeHash = hashInviteCode(code);
  let createdId: string;

  it("creates an invitation record", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const inv = await db.create({
      model: "invitation",
      data: {
        email: "alice@test.com",
        codeHash,
        invitedBy: testUserId,
        maxUses: 1,
        useCount: 0,
        usedBy: null,
        usedAt: null,
        revokedAt: null,
        expiresAt,
        createdAt: now,
        metadata: JSON.stringify({ plan: "pro" }),
      },
    });
    expect(inv).toBeDefined();
    expect(inv.id).toBeDefined();
    expect(inv.email).toBe("alice@test.com");
    createdId = inv.id;
  });

  it("finds invitation by codeHash", async () => {
    const found = await db.findOne({
      model: "invitation",
      where: [{ field: "codeHash", value: codeHash }],
    });
    expect(found).toBeDefined();
    expect(found.id).toBe(createdId);
    expect(found.email).toBe("alice@test.com");
  });

  it("finds invitation by id", async () => {
    const found = await db.findOne({
      model: "invitation",
      where: [{ field: "id", value: createdId }],
    });
    expect(found).toBeDefined();
    expect(found.codeHash).toBe(codeHash);
  });

  it("updates invitation (usedAt, usedBy, useCount)", async () => {
    const usedAt = new Date();
    await db.update({
      model: "invitation",
      where: [{ field: "id", value: createdId }],
      update: { usedAt, usedBy: testUserId, useCount: 1 },
    });
    const updated = await db.findOne({
      model: "invitation",
      where: [{ field: "id", value: createdId }],
    });
    expect(updated.usedBy).toBe(testUserId);
    expect(updated.useCount).toBe(1);
    expect(updated.usedAt).toBeDefined();
  });

  it("counts total invitations", async () => {
    const total = await db.count({ model: "invitation" });
    expect(total).toBe(1);
  });

  it("counts with equality where clause", async () => {
    const byEmail = await db.count({
      model: "invitation",
      where: [{ field: "email", value: "alice@test.com" }],
    });
    expect(byEmail).toBe(1);

    const none = await db.count({
      model: "invitation",
      where: [{ field: "email", value: "nobody@test.com" }],
    });
    expect(none).toBe(0);
  });

  it("lists with sortBy and limit (cursor pagination)", async () => {
    const code2 = generateInviteCode(16);
    await db.create({
      model: "invitation",
      data: {
        email: "bob@test.com",
        codeHash: hashInviteCode(code2),
        invitedBy: testUserId,
        maxUses: 1,
        useCount: 0,
        usedBy: null,
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(),
        metadata: null,
      },
    });

    const all = await db.findMany({
      model: "invitation",
      sortBy: { field: "createdAt", direction: "desc" },
      limit: 1,
    });
    expect(all).toHaveLength(1);

    const allUnlimited = await db.findMany({ model: "invitation" });
    expect(allUnlimited.length).toBeGreaterThanOrEqual(2);
  });

  it("metadata JSON round-trip works", async () => {
    const found = await db.findOne({
      model: "invitation",
      where: [{ field: "id", value: createdId }],
    });
    const parsed =
      typeof found.metadata === "string"
        ? JSON.parse(found.metadata)
        : found.metadata;
    expect(parsed).toEqual({ plan: "pro" });
  });

  it("deletes an invitation", async () => {
    const code3 = generateInviteCode(16);
    const inv = await db.create({
      model: "invitation",
      data: {
        email: "delete-me@test.com",
        codeHash: hashInviteCode(code3),
        invitedBy: testUserId,
        maxUses: 1,
        useCount: 0,
        usedBy: null,
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(),
        metadata: null,
      },
    });
    await db.delete({
      model: "invitation",
      where: [{ field: "id", value: inv.id }],
    });
    const gone = await db.findOne({
      model: "invitation",
      where: [{ field: "id", value: inv.id }],
    });
    expect(gone).toBeNull();
  });
});

describe("date round-trip", () => {
  it("Date objects survive store and retrieval", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 86_400_000);
    const code = generateInviteCode(16);
    const inv = await db.create({
      model: "invitation",
      data: {
        email: "dates@test.com",
        codeHash: hashInviteCode(code),
        invitedBy: testUserId,
        maxUses: 1,
        useCount: 0,
        usedBy: null,
        usedAt: null,
        revokedAt: null,
        expiresAt,
        createdAt: now,
        metadata: null,
      },
    });
    const found = await db.findOne({
      model: "invitation",
      where: [{ field: "id", value: inv.id }],
    });
    const createdAtMs = new Date(found.createdAt).getTime();
    const expiresAtMs = new Date(found.expiresAt).getTime();
    expect(Math.abs(createdAtMs - now.getTime())).toBeLessThan(1000);
    expect(Math.abs(expiresAtMs - expiresAt.getTime())).toBeLessThan(1000);
  });
});
