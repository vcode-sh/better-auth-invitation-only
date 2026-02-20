import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invitation } from "./types";

// Mock better-auth/api so createAuthEndpoint passes through the handler
vi.mock("better-auth/api", () => ({
  createAuthEndpoint: (_path: string, _options: any, handler: any) => handler,
}));

// Mock utils to isolate from crypto
vi.mock("./utils", () => ({
  hashInviteCode: vi.fn((code: string) => `hash_${code}`),
  isInvitationValid: vi.fn((inv: any) => {
    if (inv.usedAt || inv.revokedAt) return false;
    if (new Date(inv.expiresAt) < new Date()) return false;
    return true;
  }),
}));

import { createPublicEndpoints } from "./public-endpoints";

// --- Shared fixtures ---

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

function makeAdapter() {
  return {
    findOne: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  };
}

function makeCtx(overrides: Record<string, any> = {}) {
  const adapter = makeAdapter();
  return {
    adapter,
    ctx: {
      context: { adapter, logger: { error: vi.fn(), warn: vi.fn() } },
      body: {},
      query: {},
      headers: new Headers(),
      json: vi.fn((data: any) => data),
      ...overrides,
    },
  };
}

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    email: "secret@private.com",
    codeHash: "hash_valid-code",
    invitedBy: "admin-1",
    usedBy: null,
    usedAt: null,
    revokedAt: null,
    expiresAt: future,
    createdAt: new Date(),
    ...overrides,
  };
}

// ------------------------------------------------------------------
// validateInviteCode
// ------------------------------------------------------------------
describe("validateInviteCode", () => {
  let handler: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const endpoints = createPublicEndpoints({ enabled: true });
    handler = endpoints.validateInviteCode;
  });

  it("returns valid=true with expiresAt for a valid code", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "valid-code" } });
    adapter.findOne.mockResolvedValue(makeInvitation());
    const result = await handler(ctx);
    expect(result.valid).toBe(true);
    expect(result.expiresAt).toBeDefined();
  });

  it("returns valid=false for unknown code", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "unknown" } });
    adapter.findOne.mockResolvedValue(null);
    const result = await handler(ctx);
    expect(result.valid).toBe(false);
    expect(result.expiresAt).toBeUndefined();
  });

  it("returns valid=false for used invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "used-code" } });
    adapter.findOne.mockResolvedValue(makeInvitation({ usedAt: new Date() }));
    const result = await handler(ctx);
    expect(result.valid).toBe(false);
  });

  it("returns valid=false for revoked invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "revoked" } });
    adapter.findOne.mockResolvedValue(
      makeInvitation({ revokedAt: new Date() })
    );
    const result = await handler(ctx);
    expect(result.valid).toBe(false);
  });

  it("returns valid=false for expired invitation", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "expired" } });
    adapter.findOne.mockResolvedValue(makeInvitation({ expiresAt: past }));
    const result = await handler(ctx);
    expect(result.valid).toBe(false);
  });

  // SEC-3: Must NOT return email (PII leak on public endpoint)
  it("SECURITY: does NOT return email field (PII leak prevention)", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "valid-code" } });
    adapter.findOne.mockResolvedValue(
      makeInvitation({ email: "secret@private.com" })
    );
    const result = await handler(ctx);
    // The result must not contain any email field
    expect(result.email).toBeUndefined();
    expect(result).not.toHaveProperty("email");
    // Also check no other PII fields leaked
    expect(result).not.toHaveProperty("invitedBy");
    expect(result).not.toHaveProperty("codeHash");
    expect(result).not.toHaveProperty("id");
  });

  it("SECURITY: does NOT return email even for invalid codes", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "used" } });
    adapter.findOne.mockResolvedValue(
      makeInvitation({ usedAt: new Date(), email: "leak@test.com" })
    );
    const result = await handler(ctx);
    expect(result).not.toHaveProperty("email");
  });

  it("looks up by codeHash, not raw code", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "my-secret-code" } });
    adapter.findOne.mockResolvedValue(null);
    await handler(ctx);
    expect(adapter.findOne).toHaveBeenCalledWith({
      model: "invitation",
      where: [{ field: "codeHash", value: "hash_my-secret-code" }],
    });
  });

  // SEC-9: Input fuzzing - XSS in code
  it("SECURITY: handles XSS payload in code without crashing", async () => {
    const { adapter, ctx } = makeCtx({
      body: { code: '<script>alert("xss")</script>' },
    });
    adapter.findOne.mockResolvedValue(null);
    const result = await handler(ctx);
    expect(result.valid).toBe(false);
  });

  // SEC-9: SQL injection attempt in code
  it("SECURITY: handles SQL injection payload in code", async () => {
    const { adapter, ctx } = makeCtx({
      body: { code: "'; DROP TABLE invitation; --" },
    });
    adapter.findOne.mockResolvedValue(null);
    const result = await handler(ctx);
    expect(result.valid).toBe(false);
    // Code is hashed before DB lookup, so raw SQL never reaches adapter
  });

  // SEC-9: Null bytes
  it("SECURITY: handles null bytes in code", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "valid\x00injected" } });
    adapter.findOne.mockResolvedValue(null);
    const result = await handler(ctx);
    expect(result.valid).toBe(false);
  });

  // Edge: expiresAt serialization - the handler calls .toISOString() on Date
  it("returns expiresAt as ISO string for valid invitation", async () => {
    const expiresAt = new Date("2026-06-15T12:00:00.000Z");
    const { adapter, ctx } = makeCtx({ body: { code: "c" } });
    adapter.findOne.mockResolvedValue(makeInvitation({ expiresAt }));
    const result = await handler(ctx);
    expect(result.expiresAt).toBe("2026-06-15T12:00:00.000Z");
  });

  it("calls ctx.json with the response data", async () => {
    const { adapter, ctx } = makeCtx({ body: { code: "c" } });
    adapter.findOne.mockResolvedValue(null);
    await handler(ctx);
    expect(ctx.json).toHaveBeenCalledWith({
      valid: false,
      expiresAt: undefined,
    });
  });
});

// ------------------------------------------------------------------
// getInviteConfig
// ------------------------------------------------------------------
describe("getInviteConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { enabled: true } when enabled is true", async () => {
    const endpoints = createPublicEndpoints({ enabled: true });
    const { ctx } = makeCtx();
    const result = await endpoints.getInviteConfig(ctx);
    expect(result).toEqual({ enabled: true });
  });

  it("returns { enabled: false } when enabled is false", async () => {
    const endpoints = createPublicEndpoints({ enabled: false });
    const { ctx } = makeCtx();
    const result = await endpoints.getInviteConfig(ctx);
    expect(result).toEqual({ enabled: false });
  });

  it("defaults to enabled=true when enabled is undefined", async () => {
    const endpoints = createPublicEndpoints({ enabled: undefined });
    const { ctx } = makeCtx();
    const result = await endpoints.getInviteConfig(ctx);
    expect(result).toEqual({ enabled: true });
  });

  it("supports async function for enabled (returns true)", async () => {
    const endpoints = createPublicEndpoints({ enabled: async () => true });
    const { ctx } = makeCtx();
    const result = await endpoints.getInviteConfig(ctx);
    expect(result).toEqual({ enabled: true });
  });

  it("supports sync function for enabled (returns false)", async () => {
    const endpoints = createPublicEndpoints({ enabled: () => false });
    const { ctx } = makeCtx();
    const result = await endpoints.getInviteConfig(ctx);
    expect(result).toEqual({ enabled: false });
  });

  // SEC-7/SEC-12: Config must ONLY return { enabled }, not internal config
  it("SECURITY: returns ONLY { enabled }, no internal config leaked", async () => {
    const endpoints = createPublicEndpoints({ enabled: true });
    const { ctx } = makeCtx();
    const result = await endpoints.getInviteConfig(ctx);
    const keys = Object.keys(result);
    expect(keys).toEqual(["enabled"]);
    // Must not leak any plugin internals
    expect(result).not.toHaveProperty("expiresInSeconds");
    expect(result).not.toHaveProperty("codeLengthBytes");
    expect(result).not.toHaveProperty("sendInviteEmail");
    expect(result).not.toHaveProperty("isAdmin");
    expect(result).not.toHaveProperty("baseUrl");
    expect(result).not.toHaveProperty("registerPath");
    expect(result).not.toHaveProperty("cookieName");
  });

  // Edge: function that throws
  it("propagates error if enabled function throws", async () => {
    const endpoints = createPublicEndpoints({
      enabled: () => {
        throw new Error("config DB down");
      },
    });
    const { ctx } = makeCtx();
    await expect(endpoints.getInviteConfig(ctx)).rejects.toThrow(
      "config DB down"
    );
  });

  it("calls ctx.json with the response", async () => {
    const endpoints = createPublicEndpoints({ enabled: true });
    const { ctx } = makeCtx();
    await endpoints.getInviteConfig(ctx);
    expect(ctx.json).toHaveBeenCalledWith({ enabled: true });
  });

  // No auth required - public endpoint
  it("does not require session (no admin check)", async () => {
    const endpoints = createPublicEndpoints({ enabled: true });
    const { ctx } = makeCtx();
    // Explicitly remove session to prove it's not accessed
    ctx.context.session = undefined;
    const result = await endpoints.getInviteConfig(ctx);
    expect(result).toEqual({ enabled: true });
  });
});
