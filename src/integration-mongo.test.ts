import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateInviteCode, hashInviteCode, inviteOnly } from "./index";

/**
 * MongoDB integration tests — verifies plugin adapter query patterns
 * against a real MongoDB instance via mongodb-memory-server.
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: any;
let testUserId: string;

function makeInvitation(overrides: Record<string, unknown> = {}) {
  const code = generateInviteCode(16);
  return {
    data: {
      email: "test@test.com",
      codeHash: hashInviteCode(code),
      invitedBy: testUserId,
      maxUses: 1,
      useCount: 0,
      usedBy: null,
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
      metadata: null,
      ...overrides,
    },
    code,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();

  const { betterAuth } = await import("better-auth");
  const { mongodbAdapter } = await import("better-auth/adapters/mongodb");
  const { getAdapter } = await import("better-auth/db");

  const auth = betterAuth({
    baseURL: "http://localhost:4000",
    database: mongodbAdapter(client.db("test-ba"), { transaction: false }),
    plugins: [
      inviteOnly({
        enabled: false,
        isAdmin: () => true,
        baseUrl: "http://localhost:4000",
      }),
    ],
    emailAndPassword: { enabled: true },
    secret: "test-secret-long-enough-for-validation-check",
  });
  db = await getAdapter(auth.options);

  const user = await db.create({
    model: "user",
    data: {
      name: "Mongo Test User",
      email: "mongo@test.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  testUserId = user.id;
}, 60_000);

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("MongoDB: CRUD operations", () => {
  let createdId: string;
  let codeHash: string;

  it("creates and finds by codeHash", async () => {
    const { data } = makeInvitation({
      email: "alice@test.com",
      metadata: JSON.stringify({ plan: "pro" }),
    });
    codeHash = data.codeHash;
    const inv = await db.create({ model: "invitation", data });
    expect(inv.id).toBeDefined();
    expect(inv.email).toBe("alice@test.com");
    createdId = inv.id;

    const found = await db.findOne({
      model: "invitation",
      where: [{ field: "codeHash", value: codeHash }],
    });
    expect(found.id).toBe(createdId);
  });

  it("finds by id", async () => {
    const found = await db.findOne({
      model: "invitation",
      where: [{ field: "id", value: createdId }],
    });
    expect(found.codeHash).toBe(codeHash);
  });

  it("updates invitation fields", async () => {
    await db.update({
      model: "invitation",
      where: [{ field: "id", value: createdId }],
      update: { usedAt: new Date(), usedBy: testUserId, useCount: 1 },
    });
    const updated = await db.findOne({
      model: "invitation",
      where: [{ field: "id", value: createdId }],
    });
    expect(updated.usedBy).toBe(testUserId);
    expect(updated.useCount).toBe(1);
    expect(updated.usedAt).toBeDefined();
  });

  it("counts total and with equality filter", async () => {
    expect(await db.count({ model: "invitation" })).toBe(1);
    expect(
      await db.count({
        model: "invitation",
        where: [{ field: "email", value: "alice@test.com" }],
      })
    ).toBe(1);
    expect(
      await db.count({
        model: "invitation",
        where: [{ field: "email", value: "nobody@test.com" }],
      })
    ).toBe(0);
  });

  it("metadata JSON round-trip", async () => {
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
    const { data } = makeInvitation({ email: "delete-me@test.com" });
    const inv = await db.create({ model: "invitation", data });
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

describe("MongoDB: query operators", () => {
  it("ne operator with null (stats query)", async () => {
    const used = await db.count({
      model: "invitation",
      where: [{ field: "usedAt", operator: "ne", value: null }],
    });
    expect(used).toBe(1);
    const unused = await db.count({
      model: "invitation",
      where: [{ field: "usedAt", value: null }],
    });
    expect(unused).toBe(0);
  });

  it("gt/lt operators on dates", async () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    expect(
      await db.count({
        model: "invitation",
        where: [{ field: "expiresAt", operator: "gt", value: new Date() }],
      })
    ).toBe(1);
    expect(
      await db.count({
        model: "invitation",
        where: [{ field: "createdAt", operator: "gt", value: past }],
      })
    ).toBe(1);
    expect(
      await db.count({
        model: "invitation",
        where: [{ field: "createdAt", operator: "lt", value: future }],
      })
    ).toBe(1);
  });

  it("multiple where conditions (pending filter)", async () => {
    const { data } = makeInvitation({ email: "pending@test.com" });
    await db.create({ model: "invitation", data });

    const pending = await db.findMany({
      model: "invitation",
      where: [
        { field: "usedAt", value: null },
        { field: "revokedAt", value: null },
        { field: "expiresAt", operator: "gt", value: new Date() },
      ],
      sortBy: { field: "createdAt", direction: "desc" },
      limit: 51,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe("pending@test.com");
  });
});

describe("MongoDB: pagination and dates", () => {
  it("sortBy + limit (cursor pagination)", async () => {
    const page = await db.findMany({
      model: "invitation",
      sortBy: { field: "createdAt", direction: "desc" },
      limit: 1,
    });
    expect(page).toHaveLength(1);

    const all = await db.findMany({ model: "invitation" });
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("cursor pagination with lt on date", async () => {
    const results = await db.findMany({
      model: "invitation",
      where: [
        {
          field: "createdAt",
          operator: "lt",
          value: new Date(Date.now() + 86_400_000),
        },
      ],
      sortBy: { field: "createdAt", direction: "desc" },
      limit: 10,
    });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("Date objects survive store and retrieval", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 86_400_000);
    const { data } = makeInvitation({
      email: "dates@test.com",
      expiresAt,
      createdAt: now,
    });
    const inv = await db.create({ model: "invitation", data });
    const found = await db.findOne({
      model: "invitation",
      where: [{ field: "id", value: inv.id }],
    });
    expect(
      Math.abs(new Date(found.createdAt).getTime() - now.getTime())
    ).toBeLessThan(1000);
    expect(
      Math.abs(new Date(found.expiresAt).getTime() - expiresAt.getTime())
    ).toBeLessThan(1000);
  });
});
