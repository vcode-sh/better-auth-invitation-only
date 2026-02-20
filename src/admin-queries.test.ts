import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "./constants";

vi.mock("better-auth/api", () => ({
  createAuthEndpoint: (_path: string, _options: any, handler: any) => handler,
  sessionMiddleware: {},
  APIError: class APIError extends Error {
    status: string;
    constructor(status: string, options?: { message?: string }) {
      super(options?.message ?? status);
      this.status = status;
    }
  },
}));

vi.mock("./utils", () => ({
  hashInviteCode: vi.fn((code: string) => `hash_${code}`),
  buildInviteUrl: vi.fn(
    (base: string, path: string, code: string) =>
      `${base}${path}?invite=${code}`
  ),
  computeInvitationStatus: vi.fn((inv: any) => {
    if (inv.revokedAt) return "revoked";
    if (inv.usedAt) return "used";
    if (new Date(inv.expiresAt) < new Date()) return "expired";
    return "pending";
  }),
  isInvitationValid: vi.fn((inv: any) => {
    if (inv.usedAt || inv.revokedAt) return false;
    return new Date(inv.expiresAt) >= new Date();
  }),
  generateInviteCode: vi.fn((bytes = 16) =>
    "a1b2c3d4".repeat(bytes / 4).slice(0, bytes * 2)
  ),
  isDomainAllowed: vi.fn((email: string, domains?: string[]) => {
    if (!domains || domains.length === 0) return true;
    const domain = email.split("@").pop()?.toLowerCase() ?? "";
    return domains.some((d) => d.toLowerCase() === domain);
  }),
}));

import { createAdminQueries } from "./admin-queries";
import type { Invitation } from "./types";

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

function makeAdapter() {
  return {
    findOne: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  };
}

function makeCtx(overrides: Record<string, any> = {}) {
  const adapter = makeAdapter();
  return {
    adapter,
    ctx: {
      context: {
        adapter,
        session: {
          user: {
            id: "admin-1",
            role: "admin",
            name: "Admin",
            email: "admin@test.com",
          },
        },
        logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
        options: { baseURL: "https://app.com/api/auth" },
      },
      body: {},
      query: {},
      headers: new Headers(),
      json: vi.fn((data: any) => data),
      ...overrides,
    },
  };
}

function inv(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    email: "user@test.com",
    codeHash: "hash_abc",
    invitedBy: "admin-1",
    maxUses: 1,
    useCount: 0,
    metadata: null,
    usedBy: null,
    usedAt: null,
    revokedAt: null,
    expiresAt: future,
    createdAt: new Date(),
    ...overrides,
  };
}

const opts = {
  expiresInSeconds: 604_800,
  codeLengthBytes: 16,
  sendInviteEmail: undefined,
  customIsAdmin: undefined,
  baseUrl: "https://app.com",
  registerPath: "/register",
  allowedDomains: undefined as string[] | undefined,
};

describe("listInvitations", () => {
  let handler: any;
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminQueries(opts).listInvitations;
  });

  it("returns items and nextCursor for paginated results", async () => {
    const { adapter, ctx } = makeCtx({ query: { status: "all", limit: 2 } });
    adapter.findMany.mockResolvedValue([
      inv({ id: "a" }),
      inv({ id: "b" }),
      inv({ id: "c" }),
    ]);
    const result = await handler(ctx);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeDefined();
  });

  it("returns no nextCursor when results fit in one page", async () => {
    const { adapter, ctx } = makeCtx({ query: { status: "all", limit: 50 } });
    adapter.findMany.mockResolvedValue([inv()]);
    const result = await handler(ctx);
    expect(result.nextCursor).toBeUndefined();
  });

  it("returns empty items for empty database", async () => {
    const { adapter, ctx } = makeCtx({ query: { status: "all", limit: 50 } });
    adapter.findMany.mockResolvedValue([]);
    const result = await handler(ctx);
    expect(result.items).toHaveLength(0);
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const { ctx } = makeCtx({ query: { status: "all", limit: 50 } });
    ctx.context.session.user.role = "user";
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ADMIN_REQUIRED);
  });

  it("applies cursor filter when cursor is provided", async () => {
    const { adapter, ctx } = makeCtx({
      query: { status: "all", limit: 10, cursor: "2025-01-01T00:00:00.000Z" },
    });
    adapter.findMany.mockResolvedValue([]);
    await handler(ctx);
    expect(adapter.findMany.mock.calls[0][0].where).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "createdAt", operator: "lt" }),
      ])
    );
  });

  it("filters 'used' status with usedAt ne null", async () => {
    const { adapter, ctx } = makeCtx({ query: { status: "used", limit: 50 } });
    adapter.findMany.mockResolvedValue([]);
    await handler(ctx);
    expect(adapter.findMany.mock.calls[0][0].where).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "usedAt",
          operator: "ne",
          value: null,
        }),
      ])
    );
  });

  it("requests limit+1 items for hasMore detection", async () => {
    const { adapter, ctx } = makeCtx({ query: { status: "all", limit: 5 } });
    adapter.findMany.mockResolvedValue([]);
    await handler(ctx);
    expect(adapter.findMany.mock.calls[0][0].limit).toBe(6);
  });

  it("filters 'pending' status with usedAt/revokedAt null and expiresAt gt now", async () => {
    const { adapter, ctx } = makeCtx({
      query: { status: "pending", limit: 50 },
    });
    adapter.findMany.mockResolvedValue([inv()]);
    await handler(ctx);
    const where = adapter.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "usedAt", value: null }),
        expect.objectContaining({ field: "revokedAt", value: null }),
        expect.objectContaining({ field: "expiresAt", operator: "gt" }),
      ])
    );
  });

  it("filters 'revoked' status with revokedAt ne null", async () => {
    const { adapter, ctx } = makeCtx({
      query: { status: "revoked", limit: 50 },
    });
    adapter.findMany.mockResolvedValue([]);
    await handler(ctx);
    expect(adapter.findMany.mock.calls[0][0].where).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "revokedAt",
          operator: "ne",
          value: null,
        }),
      ])
    );
  });

  it("filters 'expired' status post-fetch via computeInvitationStatus", async () => {
    const { adapter, ctx } = makeCtx({
      query: { status: "expired", limit: 50 },
    });
    adapter.findMany.mockResolvedValue([
      inv({ id: "a", expiresAt: past }),
      inv({ id: "b", expiresAt: future }),
    ]);
    const result = await handler(ctx);
    expect(result.items.every((i: any) => i.status === "expired")).toBe(true);
    expect(result.items).toHaveLength(1);
  });
});

describe("invitationStats", () => {
  let handler: any;
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminQueries(opts).invitationStats;
  });

  it("returns correct breakdown", async () => {
    const { adapter, ctx } = makeCtx();
    adapter.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const r = await handler(ctx);
    expect(r).toEqual({
      total: 10,
      pending: 4,
      used: 3,
      expired: 1,
      revoked: 2,
    });
  });

  it("handles empty database (all zeros)", async () => {
    const { adapter, ctx } = makeCtx();
    adapter.count.mockResolvedValue(0);
    expect(await handler(ctx)).toEqual({
      total: 0,
      pending: 0,
      used: 0,
      expired: 0,
      revoked: 0,
    });
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const { ctx } = makeCtx();
    ctx.context.session.user.role = "user";
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ADMIN_REQUIRED);
  });

  // FIX: pending floors at 0 when DB counts overlap (used+revoked+expired > total)
  it("pending floors at 0 when counts overlap (Math.max guard)", async () => {
    const { adapter, ctx } = makeCtx();
    adapter.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    expect((await handler(ctx)).pending).toBe(0);
  });

  it("falls back to findMany when adapter.count() throws", async () => {
    const { adapter, ctx } = makeCtx();
    adapter.count.mockRejectedValue(new Error("count not supported"));
    adapter.findMany.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);
    const r = await handler(ctx);
    expect(r.total).toBe(3);
    expect(adapter.findMany).toHaveBeenCalled();
  });

  it("falls back to findMany when adapter.count() returns unexpected type", async () => {
    const { adapter, ctx } = makeCtx();
    adapter.count.mockResolvedValue("not-a-number");
    adapter.findMany.mockResolvedValue([{ id: "1" }]);
    const r = await handler(ctx);
    expect(r.total).toBe(1);
  });

  it("handles adapter.count() returning { count: N } object", async () => {
    const { adapter, ctx } = makeCtx();
    adapter.count
      .mockResolvedValueOnce({ count: 10 })
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    const r = await handler(ctx);
    expect(r).toEqual({
      total: 10,
      pending: 4,
      used: 3,
      expired: 1,
      revoked: 2,
    });
  });
});

describe("listInvitations — metadata", () => {
  let handler: any;
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminQueries(opts).listInvitations;
  });

  it("items include parsed metadata field", async () => {
    const { adapter, ctx } = makeCtx({ query: { status: "all", limit: 50 } });
    adapter.findMany.mockResolvedValue([
      inv({ metadata: JSON.stringify({ team: "eng" }) }),
    ]);
    const result = await handler(ctx);
    expect(result.items[0].metadata).toEqual({ team: "eng" });
  });
});
