import { afterEach, describe, expect, it, vi } from "vitest";
import { inviteOnlyClient } from "./client";

function createMockFetch(responses: Record<string, any> = {}) {
	return vi.fn(async (path: string) => {
		const data = responses[path] ?? {};
		return { data };
	});
}

describe("inviteOnlyClient", () => {
	it("returns a client plugin with correct id", () => {
		const client = inviteOnlyClient();
		expect(client.id).toBe("invite-only");
	});

	it("has $InferServerPlugin property", () => {
		const client = inviteOnlyClient();
		expect(client.$InferServerPlugin).toBeDefined();
	});

	it("getActions returns all expected methods", () => {
		const client = inviteOnlyClient();
		const actions = client.getActions(createMockFetch(), {}, {});
		expect(actions.createInvitation).toBeTypeOf("function");
		expect(actions.listInvitations).toBeTypeOf("function");
		expect(actions.revokeInvitation).toBeTypeOf("function");
		expect(actions.resendInvitation).toBeTypeOf("function");
		expect(actions.validateInviteCode).toBeTypeOf("function");
		expect(actions.getInvitationStats).toBeTypeOf("function");
		expect(actions.getInviteConfig).toBeTypeOf("function");
		expect(actions.setInviteCodeCookie).toBeTypeOf("function");
		expect(actions.clearInviteCodeCookie).toBeTypeOf("function");
	});
});

describe("createInvitation", () => {
	it("calls POST /invite-only/create with email and sendEmail", async () => {
		const mockFetch = createMockFetch({
			"/invite-only/create": { id: "1", code: "abc", email: "a@b.com", inviteUrl: "url", emailSent: true },
		});
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		const result = await actions.createInvitation({ email: "a@b.com", sendEmail: true });

		expect(mockFetch).toHaveBeenCalledWith("/invite-only/create", {
			method: "POST",
			body: { email: "a@b.com", sendEmail: true },
		});
		expect(result.data?.code).toBe("abc");
		expect(result.data?.emailSent).toBe(true);
	});

	it("defaults sendEmail to undefined when not passed", async () => {
		const mockFetch = createMockFetch({ "/invite-only/create": {} });
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		await actions.createInvitation({ email: "a@b.com" });

		expect(mockFetch).toHaveBeenCalledWith("/invite-only/create", {
			method: "POST",
			body: { email: "a@b.com" },
		});
	});
});

describe("listInvitations", () => {
	it("calls GET /invite-only/list with no params by default", async () => {
		const mockFetch = createMockFetch({ "/invite-only/list": { items: [], nextCursor: undefined } });
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		await actions.listInvitations();

		expect(mockFetch).toHaveBeenCalledWith("/invite-only/list", { method: "GET" });
	});

	it("appends query params when provided", async () => {
		const mockFetch = createMockFetch();
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		await actions.listInvitations({ status: "pending", limit: 10, cursor: "2026-01-01" });

		const calledPath = mockFetch.mock.calls[0][0] as string;
		expect(calledPath).toContain("status=pending");
		expect(calledPath).toContain("limit=10");
		expect(calledPath).toContain("cursor=2026-01-01");
	});
});

describe("revokeInvitation", () => {
	it("calls POST /invite-only/revoke with id", async () => {
		const mockFetch = createMockFetch({ "/invite-only/revoke": { success: true } });
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		const result = await actions.revokeInvitation({ id: "inv-1" });

		expect(mockFetch).toHaveBeenCalledWith("/invite-only/revoke", {
			method: "POST",
			body: { id: "inv-1" },
		});
		expect(result.data?.success).toBe(true);
	});
});

describe("resendInvitation", () => {
	it("calls POST /invite-only/resend with id", async () => {
		const mockFetch = createMockFetch({
			"/invite-only/resend": { success: true, newInvitationId: "inv-3", inviteUrl: "https://app.com/register?invite=newcode" },
		});
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		const result = await actions.resendInvitation({ id: "inv-2" });

		expect(mockFetch).toHaveBeenCalledWith("/invite-only/resend", {
			method: "POST",
			body: { id: "inv-2" },
		});
		expect(result.data?.success).toBe(true);
		expect(result.data?.newInvitationId).toBe("inv-3");
	});
});

describe("validateInviteCode", () => {
	it("calls POST /invite-only/validate with code", async () => {
		const mockFetch = createMockFetch({
			"/invite-only/validate": { valid: true, expiresAt: "2026-01-01" },
		});
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		const result = await actions.validateInviteCode({ code: "mycode" });

		expect(mockFetch).toHaveBeenCalledWith("/invite-only/validate", {
			method: "POST",
			body: { code: "mycode" },
		});
		expect(result.data?.valid).toBe(true);
		expect(result.data?.expiresAt).toBe("2026-01-01");
	});

	it("returns valid: false for invalid code", async () => {
		const mockFetch = createMockFetch({ "/invite-only/validate": { valid: false } });
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		const result = await actions.validateInviteCode({ code: "bad" });
		expect(result.data?.valid).toBe(false);
		expect(result.data?.expiresAt).toBeUndefined();
	});
});

describe("getInvitationStats", () => {
	it("calls GET /invite-only/stats", async () => {
		const stats = { total: 10, pending: 5, used: 3, expired: 1, revoked: 1 };
		const mockFetch = createMockFetch({ "/invite-only/stats": stats });
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		const result = await actions.getInvitationStats();
		expect(result.data).toEqual(stats);
	});
});

describe("getInviteConfig", () => {
	it("calls GET /invite-only/config and returns only enabled", async () => {
		const mockFetch = createMockFetch({ "/invite-only/config": { enabled: true } });
		const actions = inviteOnlyClient().getActions(mockFetch, {}, {});

		const result = await actions.getInviteConfig();
		expect(result.data?.enabled).toBe(true);
	});
});

describe("setInviteCodeCookie", () => {
	afterEach(() => {
		document.cookie = "ba-invite-code=; max-age=0";
	});

	it("sets the cookie in the browser", () => {
		const actions = inviteOnlyClient().getActions(createMockFetch(), {}, {});
		actions.setInviteCodeCookie("mycode123");
		expect(document.cookie).toContain("ba-invite-code=mycode123");
	});

	it("uses custom cookie name", () => {
		const actions = inviteOnlyClient().getActions(createMockFetch(), {}, {});
		actions.setInviteCodeCookie("code", "custom-name");
		expect(document.cookie).toContain("custom-name=code");
		document.cookie = "custom-name=; max-age=0";
	});
});

describe("clearInviteCodeCookie", () => {
	it("clears the cookie", () => {
		document.cookie = "ba-invite-code=val; path=/";
		const actions = inviteOnlyClient().getActions(createMockFetch(), {}, {});
		actions.clearInviteCodeCookie();
		expect(document.cookie).not.toContain("ba-invite-code=val");
	});
});
