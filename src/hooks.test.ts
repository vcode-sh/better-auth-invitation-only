import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES, PENDING_MAX_SIZE, PENDING_TTL_MS } from "./constants";
import {
  __pendingInvites,
  cleanupPendingInvites,
  createAfterHooks,
  createBeforeHooks,
  startCleanupInterval,
} from "./hooks";
import { hashInviteCode } from "./utils";

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);

const inv = (o: Record<string, any> = {}) => ({
  id: "inv-1",
  email: "alice@example.com",
  codeHash: hashInviteCode("valid-code"),
  invitedBy: "admin-1",
  maxUses: 1,
  useCount: 0,
  metadata: null,
  usedBy: null,
  usedAt: null,
  revokedAt: null,
  expiresAt: future(),
  createdAt: new Date(),
  ...o,
});

const mkAdapter = () => ({
  findOne: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
});

const OPTS = {
  enabled: true as const,
  emailSignupPath: "/sign-up/email",
  interceptOauth: true,
  oauthPrefix: "/callback/",
  cookieName: "ba-invite-code",
};

const eCtx = (adapter: any, body: any) => ({
  path: "/sign-up/email",
  body,
  headers: new Headers(),
  context: { adapter },
});

const oCtx = (adapter: any, cookie?: string) => {
  const h = new Headers();
  if (cookie !== undefined) h.set("cookie", `ba-invite-code=${cookie}`);
  return {
    path: "/callback/google",
    body: {},
    headers: h,
    context: { adapter },
  };
};

const aCtx = (adapter: any, user: any, cookie?: string) => {
  const h = new Headers();
  if (cookie) h.set("cookie", `ba-invite-code=${cookie}`);
  return {
    path: "/sign-up/email",
    body: {},
    headers: h,
    context: {
      adapter,
      newUser: user,
      logger: { error: vi.fn(), warn: vi.fn() },
    },
  };
};

describe("hooks.ts", () => {
  beforeEach(() => {
    __pendingInvites.clear();
    vi.restoreAllMocks();
  });

  // --- cleanupPendingInvites ---
  describe("cleanup", () => {
    it("removes expired, keeps fresh", () => {
      __pendingInvites.set("old", {
        invitationId: "x",
        createdAt: Date.now() - PENDING_TTL_MS - 1,
      });
      __pendingInvites.set("new", { invitationId: "y", createdAt: Date.now() });
      cleanupPendingInvites();
      expect(__pendingInvites.has("old")).toBe(false);
      expect(__pendingInvites.has("new")).toBe(true);
    });

    it("removes ALL expired entries (not just first)", () => {
      for (let i = 0; i < 50; i++)
        __pendingInvites.set(`e${i}`, {
          invitationId: `i${i}`,
          createdAt: Date.now() - PENDING_TTL_MS - 1,
        });
      __pendingInvites.set("keep", {
        invitationId: "k",
        createdAt: Date.now(),
      });
      cleanupPendingInvites();
      expect(__pendingInvites.size).toBe(1);
    });

    it("no-ops on empty map", () => {
      expect(() => cleanupPendingInvites()).not.toThrow();
    });

    it("entry at exactly TTL boundary is NOT removed (off-by-one)", () => {
      // createdAt exactly PENDING_TTL_MS ago: now - createdAt === PENDING_TTL_MS, NOT > PENDING_TTL_MS
      __pendingInvites.set("boundary", {
        invitationId: "b",
        createdAt: Date.now() - PENDING_TTL_MS,
      });
      cleanupPendingInvites();
      expect(__pendingInvites.has("boundary")).toBe(true);
    });
  });

  describe("startCleanupInterval", () => {
    it("idempotent — multiple calls do not throw", () => {
      expect(() => {
        startCleanupInterval();
        startCleanupInterval();
      }).not.toThrow();
    });
  });

  // --- Before hooks: Email signup ---
  describe("before — email signup", () => {
    it("INVITE_REQUIRED when no inviteCode", async () => {
      const a = mkAdapter();
      const h = createBeforeHooks(OPTS);
      await expect(h[0].handler(eCtx(a, { email: "a@b.com" }))).rejects.toThrow(
        ERROR_CODES.INVITE_REQUIRED
      );
    });

    it("INVALID_INVITE when code not found", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(null);
      await expect(
        createBeforeHooks(OPTS)[0].handler(
          eCtx(a, { email: "a@b.com", inviteCode: "bad" })
        )
      ).rejects.toThrow(ERROR_CODES.INVALID_INVITE);
    });

    it("INVALID_INVITE for expired invitation", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ expiresAt: past() }));
      await expect(
        createBeforeHooks(OPTS)[0].handler(
          eCtx(a, { email: "a@b.com", inviteCode: "valid-code" })
        )
      ).rejects.toThrow(ERROR_CODES.INVALID_INVITE);
    });

    it("INVALID_INVITE for used invitation", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ usedAt: new Date(), usedBy: "x" }));
      await expect(
        createBeforeHooks(OPTS)[0].handler(
          eCtx(a, { email: "a@b.com", inviteCode: "valid-code" })
        )
      ).rejects.toThrow(ERROR_CODES.INVALID_INVITE);
    });

    it("INVALID_INVITE for revoked invitation", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ revokedAt: new Date() }));
      await expect(
        createBeforeHooks(OPTS)[0].handler(
          eCtx(a, { email: "a@b.com", inviteCode: "valid-code" })
        )
      ).rejects.toThrow(ERROR_CODES.INVALID_INVITE);
    });

    it("stores pending entry keyed by lowercased email", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      await createBeforeHooks(OPTS)[0].handler(
        eCtx(a, { email: "ALICE@Example.COM", inviteCode: "valid-code" })
      );
      expect(__pendingInvites.has("alice@example.com")).toBe(true);
    });

    it("SEC-6: EMAIL_MISMATCH when signup email != invitation email", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ email: "alice@example.com" }));
      await expect(
        createBeforeHooks(OPTS)[0].handler(
          eCtx(a, { email: "mallory@evil.com", inviteCode: "valid-code" })
        )
      ).rejects.toThrow(ERROR_CODES.EMAIL_MISMATCH);
    });

    it("allows any email when invitation.email is empty (no binding)", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ email: "" }));
      await expect(
        createBeforeHooks(OPTS)[0].handler(
          eCtx(a, { email: "anyone@x.com", inviteCode: "valid-code" })
        )
      ).resolves.not.toThrow();
    });

    it("bypasses gate when enabled=false", async () => {
      const a = mkAdapter();
      await expect(
        createBeforeHooks({ ...OPTS, enabled: false })[0].handler(eCtx(a, {}))
      ).resolves.not.toThrow();
    });

    it("bypasses gate when enabled is async () => false", async () => {
      const a = mkAdapter();
      await expect(
        createBeforeHooks({ ...OPTS, enabled: async () => false })[0].handler(
          eCtx(a, {})
        )
      ).resolves.not.toThrow();
    });

    it("enabled defaults to true when undefined", async () => {
      const a = mkAdapter();
      await expect(
        createBeforeHooks({ ...OPTS, enabled: undefined })[0].handler(
          eCtx(a, { email: "a@b.com" })
        )
      ).rejects.toThrow(ERROR_CODES.INVITE_REQUIRED);
    });

    it("SEC-2: cleanup triggered at PENDING_MAX_SIZE", async () => {
      for (let i = 0; i < PENDING_MAX_SIZE; i++)
        __pendingInvites.set(`f${i}`, {
          invitationId: `i${i}`,
          createdAt: Date.now() - PENDING_TTL_MS - 1,
        });
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      await createBeforeHooks(OPTS)[0].handler(
        eCtx(a, { email: "alice@example.com", inviteCode: "valid-code" })
      );
      expect(__pendingInvites.size).toBe(1);
    });

    it("SEC-2 FIX: map at PENDING_MAX_SIZE with all fresh entries rejects with TOO_MANY_REQUESTS", async () => {
      // Fill with FRESH entries — cleanup won't remove any
      for (let i = 0; i < PENDING_MAX_SIZE; i++)
        __pendingInvites.set(`f${i}`, {
          invitationId: `i${i}`,
          createdAt: Date.now(),
        });
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      await expect(
        createBeforeHooks(OPTS)[0].handler(
          eCtx(a, { email: "alice@example.com", inviteCode: "valid-code" })
        )
      ).rejects.toThrow("Too many pending signups");
      expect(__pendingInvites.size).toBe(PENDING_MAX_SIZE);
    });

    it("no pending entry when body has no email", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ email: "" }));
      await createBeforeHooks(OPTS)[0].handler(
        eCtx(a, { inviteCode: "valid-code" })
      );
      expect(__pendingInvites.size).toBe(0);
    });

    it("handles null body gracefully", async () => {
      const a = mkAdapter();
      await expect(
        createBeforeHooks(OPTS)[0].handler(eCtx(a, null))
      ).rejects.toThrow(ERROR_CODES.INVITE_REQUIRED);
    });

    it("email with only whitespace is treated as falsy (no pending set)", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ email: "" }));
      await createBeforeHooks(OPTS)[0].handler(
        eCtx(a, { email: "   ", inviteCode: "valid-code" })
      );
      // " ".toLowerCase().trim() === "" which is falsy
      expect(__pendingInvites.size).toBe(0);
    });

    it("same user signing up twice overwrites pending entry", async () => {
      const a = mkAdapter();
      a.findOne
        .mockResolvedValueOnce(inv({ id: "inv-A" }))
        .mockResolvedValueOnce(inv({ id: "inv-B" }));
      const h = createBeforeHooks(OPTS);
      await h[0].handler(
        eCtx(a, { email: "alice@example.com", inviteCode: "valid-code" })
      );
      await h[0].handler(
        eCtx(a, { email: "alice@example.com", inviteCode: "valid-code" })
      );
      // Second call overwrites — maps have set semantics
      expect(__pendingInvites.get("alice@example.com")?.invitationId).toBe(
        "inv-B"
      );
    });
  });

  // --- Before hooks: OAuth ---
  describe("before — OAuth", () => {
    it("INVITE_REQUIRED when no cookie", async () => {
      const a = mkAdapter();
      await expect(createBeforeHooks(OPTS)[1].handler(oCtx(a))).rejects.toThrow(
        ERROR_CODES.INVITE_REQUIRED
      );
    });

    it("SEC-1: stores with __code: prefix, not email", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      await createBeforeHooks(OPTS)[1].handler(oCtx(a, "valid-code"));
      expect(__pendingInvites.has("__code:valid-code")).toBe(true);
      expect(__pendingInvites.has("alice@example.com")).toBe(false);
    });

    it("SEC-1: concurrent OAuth with different codes = separate entries", async () => {
      const a = mkAdapter();
      a.findOne
        .mockResolvedValueOnce(inv({ id: "A" }))
        .mockResolvedValueOnce(inv({ id: "B" }));
      const h = createBeforeHooks(OPTS);
      await h[1].handler(oCtx(a, "code-A"));
      await h[1].handler(oCtx(a, "code-B"));
      expect(__pendingInvites.get("__code:code-A")?.invitationId).toBe("A");
      expect(__pendingInvites.get("__code:code-B")?.invitationId).toBe("B");
    });

    it("no OAuth hook when interceptOauth=false", () => {
      expect(
        createBeforeHooks({ ...OPTS, interceptOauth: false })
      ).toHaveLength(1);
    });

    it("OAuth does NOT enforce email binding (design gap)", async () => {
      // Invitation bound to alice@, but OAuth has no email to check — passes
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ email: "alice@specific.com" }));
      await expect(
        createBeforeHooks(OPTS)[1].handler(oCtx(a, "valid-code"))
      ).resolves.not.toThrow();
    });

    it("handles headers with no get method", async () => {
      const a = mkAdapter();
      const ctx = {
        path: "/callback/google",
        body: {},
        headers: null as any,
        context: { adapter: a },
      };
      await expect(createBeforeHooks(OPTS)[1].handler(ctx)).rejects.toThrow(
        ERROR_CODES.INVITE_REQUIRED
      );
    });

    it("INVALID_INVITE when OAuth cookie points to expired invitation", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ expiresAt: past() }));
      await expect(
        createBeforeHooks(OPTS)[1].handler(oCtx(a, "valid-code"))
      ).rejects.toThrow(ERROR_CODES.INVALID_INVITE);
    });

    it("INVALID_INVITE when OAuth cookie points to used invitation", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ usedAt: new Date(), usedBy: "x" }));
      await expect(
        createBeforeHooks(OPTS)[1].handler(oCtx(a, "valid-code"))
      ).rejects.toThrow(ERROR_CODES.INVALID_INVITE);
    });

    it("INVALID_INVITE when OAuth cookie code not found in DB", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(null);
      await expect(
        createBeforeHooks(OPTS)[1].handler(oCtx(a, "unknown-code"))
      ).rejects.toThrow(ERROR_CODES.INVALID_INVITE);
    });

    it("TOO_MANY_REQUESTS when OAuth pending map is full with fresh entries", async () => {
      for (let i = 0; i < PENDING_MAX_SIZE; i++)
        __pendingInvites.set(`f${i}`, {
          invitationId: `i${i}`,
          createdAt: Date.now(),
        });
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      await expect(
        createBeforeHooks(OPTS)[1].handler(oCtx(a, "valid-code"))
      ).rejects.toThrow("Too many pending signups");
    });

    it("OAuth cleanup frees space when map is full of expired entries", async () => {
      for (let i = 0; i < PENDING_MAX_SIZE; i++)
        __pendingInvites.set(`f${i}`, {
          invitationId: `i${i}`,
          createdAt: Date.now() - PENDING_TTL_MS - 1,
        });
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      await createBeforeHooks(OPTS)[1].handler(oCtx(a, "valid-code"));
      expect(__pendingInvites.has("__code:valid-code")).toBe(true);
    });
  });

  // --- Matchers ---
  describe("matchers", () => {
    it("email: exact match only", () => {
      const m = createBeforeHooks(OPTS)[0].matcher;
      expect(m({ path: "/sign-up/email" })).toBe(true);
      expect(m({ path: "/sign-up/email/" })).toBe(false);
      expect(m({ path: "/other" })).toBe(false);
    });

    it("OAuth: prefix match", () => {
      const m = createBeforeHooks(OPTS)[1].matcher;
      expect(m({ path: "/callback/google" })).toBe(true);
      expect(m({ path: "/callback/" })).toBe(true);
      expect(m({ path: "/other" })).toBe(false);
    });

    it("after: matches both email and OAuth paths", () => {
      const m = createAfterHooks(OPTS)[0].matcher;
      expect(m({ path: "/sign-up/email" })).toBe(true);
      expect(m({ path: "/callback/github" })).toBe(true);
      expect(m({ path: "/login" })).toBe(false);
    });

    it("OAuth matcher safe with undefined path", () => {
      const m = createBeforeHooks(OPTS)[1].matcher;
      expect(m({ path: undefined })).toBeFalsy();
    });
  });

  // --- After hooks ---
  describe("after — consuming invitations", () => {
    it("consumes by email key and updates DB", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      a.update.mockResolvedValue({});
      __pendingInvites.set("alice@example.com", {
        invitationId: "inv-1",
        createdAt: Date.now(),
      });
      await createAfterHooks(OPTS)[0].handler(
        aCtx(a, { id: "u1", email: "Alice@Example.com" })
      );
      expect(a.update).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "invitation",
          where: [{ field: "id", value: "inv-1" }],
        })
      );
      expect(__pendingInvites.has("alice@example.com")).toBe(false);
    });

    it("consumes by __code: key for OAuth", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      a.update.mockResolvedValue({});
      __pendingInvites.set("__code:oc", {
        invitationId: "inv-o",
        createdAt: Date.now(),
      });
      const ctx = aCtx(a, { id: "u2", email: "bob@test.com" }, "oc");
      ctx.path = "/callback/google";
      await createAfterHooks(OPTS)[0].handler(ctx);
      expect(a.update).toHaveBeenCalled();
      expect(__pendingInvites.has("__code:oc")).toBe(false);
    });

    it("prefers email key over __code: key", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      a.update.mockResolvedValue({});
      __pendingInvites.set("alice@example.com", {
        invitationId: "by-email",
        createdAt: Date.now(),
      });
      __pendingInvites.set("__code:c", {
        invitationId: "by-code",
        createdAt: Date.now(),
      });
      await createAfterHooks(OPTS)[0].handler(
        aCtx(a, { id: "u1", email: "alice@example.com" }, "c")
      );
      expect(a.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [{ field: "id", value: "by-email" }],
        })
      );
      expect(__pendingInvites.has("__code:c")).toBe(true); // not consumed
    });

    it("no-op when user.id is falsy", async () => {
      const a = mkAdapter();
      await createAfterHooks(OPTS)[0].handler(aCtx(a, { id: "" }));
      expect(a.update).not.toHaveBeenCalled();
    });

    it("no-op when no pending entry (TTL expired between hooks)", async () => {
      const a = mkAdapter();
      await createAfterHooks(OPTS)[0].handler(
        aCtx(a, { id: "u1", email: "a@b.com" })
      );
      expect(a.update).not.toHaveBeenCalled();
    });

    it("catches adapter.update failure and logs", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      a.update.mockRejectedValue(new Error("boom"));
      __pendingInvites.set("a@b.com", {
        invitationId: "inv-1",
        createdAt: Date.now(),
      });
      const ctx = aCtx(a, { id: "u1", email: "a@b.com" });
      await expect(
        createAfterHooks(OPTS)[0].handler(ctx)
      ).resolves.not.toThrow();
      expect(ctx.context.logger.error).toHaveBeenCalled();
    });

    it("reads from ctx.context.returned.user when newUser absent", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      a.update.mockResolvedValue({});
      __pendingInvites.set("bob@t.com", {
        invitationId: "inv-r",
        createdAt: Date.now(),
      });
      const ctx = {
        path: "/sign-up/email",
        body: {},
        headers: new Headers(),
        context: {
          adapter: a,
          returned: { user: { id: "ur", email: "bob@t.com" } },
          logger: { error: vi.fn() },
        },
      };
      await createAfterHooks(OPTS)[0].handler(ctx);
      expect(a.update).toHaveBeenCalled();
    });

    it("no-op when both newUser and returned are absent", async () => {
      const a = mkAdapter();
      const ctx = {
        path: "/sign-up/email",
        body: {},
        headers: new Headers(),
        context: { adapter: a },
      };
      await expect(
        createAfterHooks(OPTS)[0].handler(ctx)
      ).resolves.not.toThrow();
      expect(a.update).not.toHaveBeenCalled();
    });

    it("no-op when user.email is null (no email key, no code key)", async () => {
      const a = mkAdapter();
      await createAfterHooks(OPTS)[0].handler(
        aCtx(a, { id: "u1", email: null as any })
      );
      expect(a.update).not.toHaveBeenCalled();
    });

    it("still works without logger (optional chaining)", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      a.update.mockRejectedValue(new Error("fail"));
      __pendingInvites.set("a@b.com", {
        invitationId: "inv-1",
        createdAt: Date.now(),
      });
      const ctx = {
        path: "/sign-up/email",
        body: {},
        headers: new Headers(),
        context: { adapter: a, newUser: { id: "u1", email: "a@b.com" } },
      };
      // logger is undefined, optional chaining should prevent crash
      await expect(
        createAfterHooks(OPTS)[0].handler(ctx)
      ).resolves.not.toThrow();
    });
  });

  // --- Multi-use codes in after hooks ---
  describe("after — multi-use codes", () => {
    it("multi-use invitation (maxUses: 5) increments useCount without setting usedAt", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ maxUses: 5, useCount: 2 }));
      a.update.mockResolvedValue({});
      __pendingInvites.set("alice@example.com", {
        invitationId: "inv-1",
        createdAt: Date.now(),
      });
      await createAfterHooks(OPTS)[0].handler(
        aCtx(a, { id: "u1", email: "Alice@Example.com" })
      );
      const updateArg = a.update.mock.calls[0][0].update;
      expect(updateArg.useCount).toBe(3);
      expect(updateArg.usedAt).toBeUndefined();
      expect(updateArg.usedBy).toBeUndefined();
    });

    it("multi-use invitation at limit sets usedAt and usedBy", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ maxUses: 3, useCount: 2 }));
      a.update.mockResolvedValue({});
      __pendingInvites.set("alice@example.com", {
        invitationId: "inv-1",
        createdAt: Date.now(),
      });
      await createAfterHooks(OPTS)[0].handler(
        aCtx(a, { id: "u1", email: "Alice@Example.com" })
      );
      const updateArg = a.update.mock.calls[0][0].update;
      expect(updateArg.useCount).toBe(3);
      expect(updateArg.usedAt).toBeInstanceOf(Date);
      expect(updateArg.usedBy).toBe("u1");
    });

    it("single-use invitation (maxUses: 1) sets usedBy, usedAt, useCount: 1", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ maxUses: 1, useCount: 0 }));
      a.update.mockResolvedValue({});
      __pendingInvites.set("alice@example.com", {
        invitationId: "inv-1",
        createdAt: Date.now(),
      });
      await createAfterHooks(OPTS)[0].handler(
        aCtx(a, { id: "u1", email: "Alice@Example.com" })
      );
      const updateArg = a.update.mock.calls[0][0].update;
      expect(updateArg.usedBy).toBe("u1");
      expect(updateArg.usedAt).toBeInstanceOf(Date);
      expect(updateArg.useCount).toBe(1);
    });
  });

  // --- onInvitationUsed callback ---
  describe("after — onInvitationUsed callback", () => {
    it("fires after successful consumption with { invitation, user }", async () => {
      const onUsed = vi.fn();
      const a = mkAdapter();
      const invitation = inv();
      a.findOne.mockResolvedValue(invitation);
      a.update.mockResolvedValue({});
      __pendingInvites.set("alice@example.com", {
        invitationId: "inv-1",
        createdAt: Date.now(),
      });
      const user = { id: "u1", email: "Alice@Example.com" };
      await createAfterHooks({ ...OPTS, onInvitationUsed: onUsed })[0].handler(
        aCtx(a, user)
      );
      expect(onUsed).toHaveBeenCalledOnce();
      expect(onUsed.mock.calls[0][0].invitation).toEqual(invitation);
      expect(onUsed.mock.calls[0][0].user).toEqual(user);
    });

    it("callback failure is caught and logged (doesn't break signup)", async () => {
      const onUsed = vi.fn().mockRejectedValue(new Error("callback boom"));
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv());
      a.update.mockResolvedValue({});
      __pendingInvites.set("alice@example.com", {
        invitationId: "inv-1",
        createdAt: Date.now(),
      });
      const ctx = aCtx(a, { id: "u1", email: "Alice@Example.com" });
      await expect(
        createAfterHooks({ ...OPTS, onInvitationUsed: onUsed })[0].handler(ctx)
      ).resolves.not.toThrow();
      expect(ctx.context.logger.error).toHaveBeenCalled();
    });

    it("callback not called when no invitation consumed", async () => {
      const onUsed = vi.fn();
      const a = mkAdapter();
      // No pending entry, so nothing to consume
      await createAfterHooks({ ...OPTS, onInvitationUsed: onUsed })[0].handler(
        aCtx(a, { id: "u1", email: "nobody@example.com" })
      );
      expect(onUsed).not.toHaveBeenCalled();
    });
  });

  // --- Domain whitelist in before hooks ---
  describe("before — domain whitelist", () => {
    it("DOMAIN_NOT_ALLOWED when email domain doesn't match allowedDomains", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ email: "" }));
      await expect(
        createBeforeHooks({
          ...OPTS,
          allowedDomains: ["allowed.com"],
        })[0].handler(
          eCtx(a, { email: "user@blocked.com", inviteCode: "valid-code" })
        )
      ).rejects.toThrow(ERROR_CODES.DOMAIN_NOT_ALLOWED);
    });

    it("passes when email domain is in allowedDomains", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ email: "" }));
      await expect(
        createBeforeHooks({
          ...OPTS,
          allowedDomains: ["allowed.com"],
        })[0].handler(
          eCtx(a, { email: "user@allowed.com", inviteCode: "valid-code" })
        )
      ).resolves.not.toThrow();
    });

    it("bypassed when allowedDomains is not set", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ email: "" }));
      await expect(
        createBeforeHooks({ ...OPTS, allowedDomains: undefined })[0].handler(
          eCtx(a, { email: "user@anything.com", inviteCode: "valid-code" })
        )
      ).resolves.not.toThrow();
    });
  });

  // --- Query param fallback ---
  describe("before — query param fallback", () => {
    it("inviteCode from ctx.query is used when body.inviteCode is missing", async () => {
      const a = mkAdapter();
      a.findOne.mockResolvedValue(inv({ email: "" }));
      const ctx = {
        path: "/sign-up/email",
        body: { email: "user@test.com" },
        query: { inviteCode: "valid-code" },
        headers: new Headers(),
        context: { adapter: a },
      };
      await expect(
        createBeforeHooks(OPTS)[0].handler(ctx)
      ).resolves.not.toThrow();
      expect(a.findOne).toHaveBeenCalled();
    });
  });

  // --- State corruption / race condition ---
  describe("state corruption", () => {
    it("enabled toggling mid-flight via async function", async () => {
      let n = 0;
      const a = mkAdapter();
      const h = createBeforeHooks({ ...OPTS, enabled: async () => ++n <= 1 });
      await expect(h[0].handler(eCtx(a, { email: "a@b.com" }))).rejects.toThrow(
        ERROR_CODES.INVITE_REQUIRED
      );
      await expect(
        h[0].handler(eCtx(a, { email: "b@b.com" }))
      ).resolves.not.toThrow();
    });

    it("enabled function that throws is not caught — propagates", async () => {
      const a = mkAdapter();
      const h = createBeforeHooks({
        ...OPTS,
        enabled: () => {
          throw new Error("config error");
        },
      });
      await expect(h[0].handler(eCtx(a, { email: "a@b.com" }))).rejects.toThrow(
        "config error"
      );
    });

    it("adapter.findOne throwing propagates (not silently swallowed)", async () => {
      const a = mkAdapter();
      a.findOne.mockRejectedValue(new Error("DB timeout"));
      await expect(
        createBeforeHooks(OPTS)[0].handler(
          eCtx(a, { email: "a@b.com", inviteCode: "x" })
        )
      ).rejects.toThrow("DB timeout");
    });
  });
});
