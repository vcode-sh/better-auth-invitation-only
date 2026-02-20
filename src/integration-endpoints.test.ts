import { getTestInstance } from "better-auth/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateInviteCode, hashInviteCode, inviteOnly } from "./index";

/**
 * Integration endpoint tests with a real better-auth instance + SQLite.
 * Tests HTTP flow through auth.handler and the internal API.
 */

let auth: any;
let db: any;
let adminId: string;
let customFetchImpl: (
  url: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const BASE = "http://localhost:3000/api/auth";

async function postJSON(path: string, body: any, headers?: Headers) {
  const h = new Headers(headers ?? {});
  h.set("content-type", "application/json");
  return customFetchImpl(`${BASE}${path}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
}

async function getJSON(path: string, headers?: Headers) {
  return customFetchImpl(`${BASE}${path}`, {
    method: "GET",
    headers: headers ?? new Headers(),
  });
}

beforeAll(async () => {
  const instance = await getTestInstance(
    {
      plugins: [
        inviteOnly({
          enabled: true,
          isAdmin: () => true,
          baseUrl: "http://localhost:3000",
        }),
      ],
      emailAndPassword: { enabled: true },
    },
    {
      testWith: "sqlite",
      disableTestUser: true,
    }
  );
  auth = instance.auth;
  db = instance.db;
  customFetchImpl = instance.customFetchImpl;

  // Create an admin user directly via adapter (bypassing invite gate)
  const user = await db.create({
    model: "user",
    data: {
      name: "Admin",
      email: "admin@test.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  adminId = user.id;
});

afterAll(() => {});

describe("plugin registration", () => {
  it("betterAuth with inviteOnly plugin does not throw", () => {
    expect(auth).toBeDefined();
    expect(auth.handler).toBeTypeOf("function");
  });

  it("auth.api includes invite-only endpoints", () => {
    expect(auth.api.validateInviteCode).toBeTypeOf("function");
    expect(auth.api.getInviteConfig).toBeTypeOf("function");
    expect(auth.api.createInvitation).toBeTypeOf("function");
    expect(auth.api.listInvitations).toBeTypeOf("function");
    expect(auth.api.invitationStats).toBeTypeOf("function");
    expect(auth.api.revokeInvitation).toBeTypeOf("function");
    expect(auth.api.resendInvitation).toBeTypeOf("function");
    expect(auth.api.deleteInvitation).toBeTypeOf("function");
    expect(auth.api.createBatchInvitations).toBeTypeOf("function");
  });
});

describe("config endpoint", () => {
  it("GET /invite-only/config returns { enabled: true }", async () => {
    const res = await getJSON("/invite-only/config");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.enabled).toBe(true);
  });
});

describe("validate endpoint", () => {
  it("returns { valid: false } for nonexistent code", async () => {
    const res = await postJSON("/invite-only/validate", {
      code: "nonexistent-code",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it("returns { valid: true } for a real pending code", async () => {
    const code = generateInviteCode(16);
    await db.create({
      model: "invitation",
      data: {
        email: "validate-test@test.com",
        codeHash: hashInviteCode(code),
        invitedBy: adminId,
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
    const res = await postJSON("/invite-only/validate", { code });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.expiresAt).toBeDefined();
  });

  it("does not leak email in validate response", async () => {
    const code = generateInviteCode(16);
    await db.create({
      model: "invitation",
      data: {
        email: "secret@test.com",
        codeHash: hashInviteCode(code),
        invitedBy: adminId,
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
    const res = await postJSON("/invite-only/validate", { code });
    const data = await res.json();
    expect(data.email).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("secret@test.com");
  });
});

describe("invite-gated signup", () => {
  it("POST /sign-up/email without inviteCode returns FORBIDDEN", async () => {
    const res = await postJSON("/sign-up/email", {
      email: "newuser@test.com",
      password: "password123456",
      name: "New User",
    });
    expect(res.status).toBe(403);
  });

  it("POST /sign-up/email with invalid inviteCode returns FORBIDDEN", async () => {
    const res = await postJSON("/sign-up/email", {
      email: "newuser2@test.com",
      password: "password123456",
      name: "New User",
      inviteCode: "bad-code",
    });
    expect(res.status).toBe(403);
  });

  it("POST /sign-up/email with valid inviteCode succeeds", async () => {
    const code = generateInviteCode(16);
    await db.create({
      model: "invitation",
      data: {
        email: "signup-test@test.com",
        codeHash: hashInviteCode(code),
        invitedBy: adminId,
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
    const res = await postJSON("/sign-up/email", {
      email: "signup-test@test.com",
      password: "password123456",
      name: "Signup User",
      inviteCode: code,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe("signup-test@test.com");
  });

  it("rejects signup when email does not match invitation", async () => {
    const code = generateInviteCode(16);
    await db.create({
      model: "invitation",
      data: {
        email: "specific@test.com",
        codeHash: hashInviteCode(code),
        invitedBy: adminId,
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
    const res = await postJSON("/sign-up/email", {
      email: "wrong@test.com",
      password: "password123456",
      name: "Wrong User",
      inviteCode: code,
    });
    expect(res.status).toBe(403);
  });
});
