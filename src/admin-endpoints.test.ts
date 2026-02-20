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

import { createAdminEndpoints } from "./admin-endpoints";
import { createAdminMutations } from "./admin-mutations";
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

describe("createInvitation", () => {
  let handler: any;
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminEndpoints({
      ...opts,
      customGenerateCode: () => "test-code-123",
    }).createInvitation;
  });

  it("creates invitation and returns id, code, inviteUrl, expiresAt, emailSent", async () => {
    const { adapter, ctx } = makeCtx({
      body: { email: "new@test.com", sendEmail: false },
    });
    adapter.create.mockResolvedValue({ id: "inv-new", email: "new@test.com" });
    const result = await handler(ctx);
    expect(result.id).toBe("inv-new");
    expect(result.code).toBe("test-code-123");
    expect(result.inviteUrl).toContain("test-code-123");
    expect(result.emailSent).toBe(false);
  });

  it("throws FORBIDDEN when user is not admin", async () => {
    const { ctx } = makeCtx({ body: { email: "x@t.com", sendEmail: false } });
    ctx.context.session.user.role = "user";
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ADMIN_REQUIRED);
  });

  it("throws FORBIDDEN when user.role is undefined (no customIsAdmin)", async () => {
    const { ctx } = makeCtx({ body: { email: "x@t.com", sendEmail: false } });
    ctx.context.session.user.role = undefined;
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ADMIN_REQUIRED);
  });

  it("sends email when sendEmail=true and sendInviteEmail configured", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const ep = createAdminEndpoints({
      ...opts,
      customGenerateCode: () => "c",
      sendInviteEmail: sendFn,
    });
    const { adapter, ctx } = makeCtx({
      body: { email: "n@t.com", sendEmail: true },
    });
    adapter.create.mockResolvedValue({ id: "inv-2" });
    const result = await ep.createInvitation(ctx);
    expect(sendFn).toHaveBeenCalledOnce();
    expect(result.emailSent).toBe(true);
  });

  it("catches email failure gracefully (emailSent=false, no throw)", async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error("SMTP down"));
    const ep = createAdminEndpoints({
      ...opts,
      customGenerateCode: () => "c",
      sendInviteEmail: sendFn,
    });
    const { adapter, ctx } = makeCtx({
      body: { email: "n@t.com", sendEmail: true },
    });
    adapter.create.mockResolvedValue({ id: "inv-3" });
    const result = await ep.createInvitation(ctx);
    expect(result.emailSent).toBe(false);
    expect(ctx.context.logger.error).toHaveBeenCalled();
  });

  it("does not call sendInviteEmail when sendEmail=false", async () => {
    const sendFn = vi.fn();
    const ep = createAdminEndpoints({
      ...opts,
      customGenerateCode: () => "c",
      sendInviteEmail: sendFn,
    });
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false },
    });
    adapter.create.mockResolvedValue({ id: "inv-4" });
    await ep.createInvitation(ctx);
    expect(sendFn).not.toHaveBeenCalled();
  });

  it("stores codeHash in DB, never raw code", async () => {
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false },
    });
    adapter.create.mockResolvedValue({ id: "inv-5" });
    await handler(ctx);
    const data = adapter.create.mock.calls[0][0].data;
    expect(data.codeHash).toBe("hash_test-code-123");
    expect(data.code).toBeUndefined();
  });

  it("respects customIsAdmin returning true for non-admin role", async () => {
    const ep = createAdminEndpoints({
      ...opts,
      customGenerateCode: () => "c",
      customIsAdmin: (u) => u.id === "s-1",
    });
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false },
    });
    ctx.context.session.user = {
      id: "s-1",
      role: "editor",
      name: "E",
      email: "e@t.com",
    };
    adapter.create.mockResolvedValue({ id: "inv-6" });
    expect((await ep.createInvitation(ctx)).id).toBe("inv-6");
  });

  it("passes maxUses param to adapter.create", async () => {
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false, maxUses: 5 },
    });
    adapter.create.mockResolvedValue({ id: "inv-m" });
    await handler(ctx);
    expect(adapter.create.mock.calls[0][0].data.maxUses).toBe(5);
  });

  it("JSON.stringifies metadata before DB insert", async () => {
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false, metadata: { plan: "pro" } },
    });
    adapter.create.mockResolvedValue({ id: "inv-m2" });
    await handler(ctx);
    expect(adapter.create.mock.calls[0][0].data.metadata).toBe(
      JSON.stringify({ plan: "pro" })
    );
  });

  it("returns metadata as parsed object in response", async () => {
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false, metadata: { plan: "pro" } },
    });
    adapter.create.mockResolvedValue({ id: "inv-m3" });
    const result = await handler(ctx);
    expect(result.metadata).toEqual({ plan: "pro" });
  });

  it("defaults maxUses to 1 when provided as 1 (Zod default in real endpoint)", async () => {
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false, maxUses: 1 },
    });
    adapter.create.mockResolvedValue({ id: "inv-d" });
    await handler(ctx);
    expect(adapter.create.mock.calls[0][0].data.maxUses).toBe(1);
  });

  it("throws DOMAIN_NOT_ALLOWED when allowedDomains rejects email", async () => {
    const ep = createAdminEndpoints({
      ...opts,
      allowedDomains: ["allowed.com"],
      customGenerateCode: () => "c",
    });
    const { ctx } = makeCtx({
      body: { email: "user@blocked.com", sendEmail: false },
    });
    await expect(ep.createInvitation(ctx)).rejects.toThrow(
      ERROR_CODES.DOMAIN_NOT_ALLOWED
    );
  });

  it("falls back to email when user name is null for invitedByName", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const ep = createAdminEndpoints({
      ...opts,
      customGenerateCode: () => "c",
      sendInviteEmail: sendFn,
    });
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: true },
    });
    ctx.context.session.user.name = null;
    adapter.create.mockResolvedValue({ id: "inv-7" });
    await ep.createInvitation(ctx);
    expect(sendFn.mock.calls[0][0].invitedByName).toBe("admin@test.com");
  });
});

describe("listInvitations", () => {
  let handler: any;
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminEndpoints(opts).listInvitations;
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
    handler = createAdminEndpoints(opts).invitationStats;
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
});

describe("revokeInvitation", () => {
  let handler: any;
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminMutations(opts).revokeInvitation;
  });

  it("revokes a pending invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv());
    adapter.update.mockResolvedValue({});
    expect(await handler(ctx)).toEqual({ success: true });
    expect(adapter.update).toHaveBeenCalledOnce();
  });

  it("throws NOT_FOUND for missing invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "nope" } });
    adapter.findOne.mockResolvedValue(null);
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.NOT_FOUND);
  });

  it("throws ALREADY_USED for used invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv({ usedAt: new Date() }));
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ALREADY_USED);
  });

  it("throws ALREADY_REVOKED for revoked invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv({ revokedAt: new Date() }));
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ALREADY_REVOKED);
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const { ctx } = makeCtx({ body: { id: "inv-1" } });
    ctx.context.session.user.role = "user";
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ADMIN_REQUIRED);
  });

  // BUG: allows revoking expired invitations (no expiry check)
  it("allows revoking an expired invitation (no expiry guard)", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv({ expiresAt: past }));
    adapter.update.mockResolvedValue({});
    expect(await handler(ctx)).toEqual({ success: true });
  });
});

describe("resendInvitation", () => {
  let handler: any;
  const sendFn = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminMutations({
      ...opts,
      customGenerateCode: () => "new-code-456",
      sendInviteEmail: sendFn,
    }).resendInvitation;
  });

  it("revokes old invitation and creates new one", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv());
    adapter.update.mockResolvedValue({});
    adapter.create.mockResolvedValue({ id: "inv-new", email: "user@test.com" });
    const r = await handler(ctx);
    expect(r.success).toBe(true);
    expect(r.newInvitationId).toBe("inv-new");
    expect(adapter.update).toHaveBeenCalledOnce();
    expect(adapter.create).toHaveBeenCalledOnce();
  });

  it("throws NOT_FOUND for missing invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "nope" } });
    adapter.findOne.mockResolvedValue(null);
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.NOT_FOUND);
  });

  it("throws NO_LONGER_VALID for used invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv({ usedAt: new Date() }));
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.NO_LONGER_VALID);
  });

  it("throws NO_LONGER_VALID for expired invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv({ expiresAt: past }));
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.NO_LONGER_VALID);
  });

  it("throws EMAIL_NOT_CONFIGURED when sendInviteEmail missing", async () => {
    const mut = createAdminMutations({ ...opts, sendInviteEmail: undefined });
    const { ctx } = makeCtx({ body: { id: "inv-1" } });
    await expect(mut.resendInvitation(ctx)).rejects.toThrow(
      ERROR_CODES.EMAIL_NOT_CONFIGURED
    );
  });

  it("throws INTERNAL_SERVER_ERROR when email send fails", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("SMTP down"));
    const mut = createAdminMutations({
      ...opts,
      customGenerateCode: () => "c",
      sendInviteEmail: fail,
    });
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv());
    adapter.update.mockResolvedValue({});
    adapter.create.mockResolvedValue({ id: "inv-new" });
    await expect(mut.resendInvitation(ctx)).rejects.toThrow(
      "Failed to send email"
    );
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const { ctx } = makeCtx({ body: { id: "inv-1" } });
    ctx.context.session.user.role = "user";
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ADMIN_REQUIRED);
  });

  // BUG: no rollback - old invitation stays revoked if create fails
  it("old invitation stays revoked even if create fails (no rollback)", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv());
    adapter.update.mockResolvedValue({});
    adapter.create.mockRejectedValue(new Error("DB constraint"));
    await expect(handler(ctx)).rejects.toThrow("DB constraint");
    expect(adapter.update).toHaveBeenCalledOnce();
  });

  it("falls back to email when user.name is null for invitedByName", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const mut = createAdminMutations({
      ...opts,
      customGenerateCode: () => "c",
      sendInviteEmail: send,
    });
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    ctx.context.session.user.name = null;
    adapter.findOne.mockResolvedValue(inv());
    adapter.update.mockResolvedValue({});
    adapter.create.mockResolvedValue({ id: "inv-new" });
    await mut.resendInvitation(ctx);
    expect(send.mock.calls[0][0].invitedByName).toBe("admin@test.com");
  });
});

describe("createBatchInvitations", () => {
  let handler: any;
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminEndpoints({
      ...opts,
      customGenerateCode: () => "batch-code",
    }).createBatchInvitations;
  });

  it("creates multiple invitations and returns items array with count", async () => {
    const { adapter, ctx } = makeCtx({
      body: {
        invitations: [
          { email: "a@t.com", sendEmail: false },
          { email: "b@t.com", sendEmail: false },
        ],
      },
    });
    adapter.create
      .mockResolvedValueOnce({ id: "inv-a" })
      .mockResolvedValueOnce({ id: "inv-b" });
    const result = await handler(ctx);
    expect(result.items).toHaveLength(2);
    expect(result.count).toBe(2);
  });

  it("each item has id, code, email, inviteUrl, expiresAt, emailSent, maxUses, metadata", async () => {
    const { adapter, ctx } = makeCtx({
      body: {
        invitations: [
          {
            email: "a@t.com",
            sendEmail: false,
            maxUses: 3,
            metadata: { role: "dev" },
          },
        ],
      },
    });
    adapter.create.mockResolvedValue({ id: "inv-a" });
    const result = await handler(ctx);
    const item = result.items[0];
    expect(item).toHaveProperty("id", "inv-a");
    expect(item).toHaveProperty("code", "batch-code");
    expect(item).toHaveProperty("email", "a@t.com");
    expect(item).toHaveProperty("inviteUrl");
    expect(item).toHaveProperty("expiresAt");
    expect(item).toHaveProperty("emailSent", false);
    expect(item).toHaveProperty("maxUses", 3);
    expect(item).toHaveProperty("metadata", { role: "dev" });
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const { ctx } = makeCtx({
      body: { invitations: [{ email: "a@t.com", sendEmail: false }] },
    });
    ctx.context.session.user.role = "user";
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ADMIN_REQUIRED);
  });

  it("domain whitelist rejection on any invalid email aborts the whole batch", async () => {
    const ep = createAdminEndpoints({
      ...opts,
      allowedDomains: ["ok.com"],
      customGenerateCode: () => "c",
    });
    const { adapter, ctx } = makeCtx({
      body: {
        invitations: [
          { email: "a@ok.com", sendEmail: false },
          { email: "b@bad.com", sendEmail: false },
        ],
      },
    });
    adapter.create.mockResolvedValue({ id: "inv-ok" });
    await expect(ep.createBatchInvitations(ctx)).rejects.toThrow(
      ERROR_CODES.DOMAIN_NOT_ALLOWED
    );
  });

  it("sends email for each item when sendEmail=true", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const ep = createAdminEndpoints({
      ...opts,
      customGenerateCode: () => "c",
      sendInviteEmail: sendFn,
    });
    const { adapter, ctx } = makeCtx({
      body: {
        invitations: [
          { email: "a@t.com", sendEmail: true },
          { email: "b@t.com", sendEmail: true },
        ],
      },
    });
    adapter.create
      .mockResolvedValueOnce({ id: "inv-a" })
      .mockResolvedValueOnce({ id: "inv-b" });
    const result = await ep.createBatchInvitations(ctx);
    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(result.items[0].emailSent).toBe(true);
    expect(result.items[1].emailSent).toBe(true);
  });

  it("respects individual maxUses and metadata per invitation", async () => {
    const { adapter, ctx } = makeCtx({
      body: {
        invitations: [
          {
            email: "a@t.com",
            sendEmail: false,
            maxUses: 3,
            metadata: { tier: "gold" },
          },
          {
            email: "b@t.com",
            sendEmail: false,
            maxUses: 10,
            metadata: { tier: "silver" },
          },
        ],
      },
    });
    adapter.create
      .mockResolvedValueOnce({ id: "inv-a" })
      .mockResolvedValueOnce({ id: "inv-b" });
    const result = await handler(ctx);
    expect(result.items[0].maxUses).toBe(3);
    expect(result.items[0].metadata).toEqual({ tier: "gold" });
    expect(result.items[1].maxUses).toBe(10);
    expect(result.items[1].metadata).toEqual({ tier: "silver" });
  });
});

describe("deleteInvitation", () => {
  let handler: any;
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminEndpoints(opts).deleteInvitation;
  });

  it("deletes an existing invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "inv-1" } });
    adapter.findOne.mockResolvedValue(inv());
    adapter.delete.mockResolvedValue({});
    const result = await handler(ctx);
    expect(result.success).toBe(true);
    expect(adapter.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "invitation",
        where: [{ field: "id", value: "inv-1" }],
      })
    );
  });

  it("throws NOT_FOUND for missing invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { id: "nope" } });
    adapter.findOne.mockResolvedValue(null);
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.NOT_FOUND);
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const { ctx } = makeCtx({ body: { id: "inv-1" } });
    ctx.context.session.user.role = "user";
    await expect(handler(ctx)).rejects.toThrow(ERROR_CODES.ADMIN_REQUIRED);
  });
});

describe("listInvitations — metadata", () => {
  let handler: any;
  beforeEach(() => {
    vi.clearAllMocks();
    handler = createAdminEndpoints(opts).listInvitations;
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

describe("admin-helpers integration", () => {
  it("makeCode uses default generator when customGenerateCode not provided", async () => {
    const ep = createAdminEndpoints({ ...opts, customGenerateCode: undefined });
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false },
    });
    adapter.create.mockResolvedValue({ id: "inv-1" });
    const result = await ep.createInvitation(ctx);
    expect(result.code).toMatch(/^[0-9a-f]+$/);
  });

  it("getBaseUrl falls back to ctx.context.options.baseURL when baseUrl not provided", async () => {
    const ep = createAdminEndpoints({
      ...opts,
      baseUrl: undefined,
      customGenerateCode: () => "c",
    });
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false },
    });
    adapter.create.mockResolvedValue({ id: "inv-1" });
    const result = await ep.createInvitation(ctx);
    expect(result.inviteUrl).toContain("https://app.com");
  });

  it("getBaseUrl returns empty string when no baseUrl or ctx baseURL", async () => {
    const ep = createAdminEndpoints({
      ...opts,
      baseUrl: undefined,
      customGenerateCode: () => "c",
    });
    const { adapter, ctx } = makeCtx({
      body: { email: "x@t.com", sendEmail: false },
    });
    ctx.context.options = {};
    adapter.create.mockResolvedValue({ id: "inv-1" });
    const result = await ep.createInvitation(ctx);
    expect(result.inviteUrl).toBe("/register?invite=c");
  });
});
