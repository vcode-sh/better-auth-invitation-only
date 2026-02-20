import { describe, expect, it } from "vitest";
import {
	buildInviteUrl,
	computeInvitationStatus,
	generateInviteCode,
	isInvitationValid,
	parseInviteCodeFromCookie,
} from "./utils";

describe("generateInviteCode", () => {
	it("generates a 32-char hex string by default (16 bytes)", () => {
		const code = generateInviteCode();
		expect(code).toMatch(/^[0-9a-f]{32}$/);
	});

	it("generates different codes each time", () => {
		const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()));
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

describe("computeInvitationStatus", () => {
	const future = new Date(Date.now() + 86400000);
	const past = new Date(Date.now() - 86400000);

	it("returns 'pending' for valid unused invitation", () => {
		expect(computeInvitationStatus({ usedAt: null, revokedAt: null, expiresAt: future })).toBe("pending");
	});

	it("returns 'used' when usedAt is set", () => {
		expect(computeInvitationStatus({ usedAt: new Date(), revokedAt: null, expiresAt: future })).toBe("used");
	});

	it("returns 'expired' when past expiresAt", () => {
		expect(computeInvitationStatus({ usedAt: null, revokedAt: null, expiresAt: past })).toBe("expired");
	});

	it("returns 'revoked' when revokedAt is set", () => {
		expect(computeInvitationStatus({ usedAt: null, revokedAt: new Date(), expiresAt: future })).toBe("revoked");
	});

	it("revoked takes priority over used", () => {
		expect(computeInvitationStatus({ usedAt: new Date(), revokedAt: new Date(), expiresAt: future })).toBe(
			"revoked",
		);
	});

	it("revoked takes priority over expired", () => {
		expect(computeInvitationStatus({ usedAt: null, revokedAt: new Date(), expiresAt: past })).toBe("revoked");
	});

	it("used takes priority over expired", () => {
		expect(computeInvitationStatus({ usedAt: new Date(), revokedAt: null, expiresAt: past })).toBe("used");
	});

	it("handles Date objects from ISO strings", () => {
		const expiresAt = new Date(new Date(Date.now() + 86400000).toISOString());
		expect(computeInvitationStatus({ usedAt: null, revokedAt: null, expiresAt })).toBe("pending");
	});
});

describe("isInvitationValid", () => {
	const future = new Date(Date.now() + 86400000);
	const past = new Date(Date.now() - 86400000);

	it("returns true for unused, not revoked, not expired", () => {
		expect(isInvitationValid({ usedAt: null, revokedAt: null, expiresAt: future })).toBe(true);
	});

	it("returns false when used", () => {
		expect(isInvitationValid({ usedAt: new Date(), revokedAt: null, expiresAt: future })).toBe(false);
	});

	it("returns false when revoked", () => {
		expect(isInvitationValid({ usedAt: null, revokedAt: new Date(), expiresAt: future })).toBe(false);
	});

	it("returns false when expired", () => {
		expect(isInvitationValid({ usedAt: null, revokedAt: null, expiresAt: past })).toBe(false);
	});

	it("returns false when all conditions are bad", () => {
		expect(isInvitationValid({ usedAt: new Date(), revokedAt: new Date(), expiresAt: past })).toBe(false);
	});
});

describe("parseInviteCodeFromCookie", () => {
	it("extracts code from simple cookie", () => {
		expect(parseInviteCodeFromCookie("ba-invite-code=abc123", "ba-invite-code")).toBe("abc123");
	});

	it("extracts code from multiple cookies", () => {
		const header = "session=xyz; ba-invite-code=mycode; theme=dark";
		expect(parseInviteCodeFromCookie(header, "ba-invite-code")).toBe("mycode");
	});

	it("returns undefined when cookie not found", () => {
		expect(parseInviteCodeFromCookie("session=xyz; theme=dark", "ba-invite-code")).toBeUndefined();
	});

	it("returns undefined for empty string", () => {
		expect(parseInviteCodeFromCookie("", "ba-invite-code")).toBeUndefined();
	});

	it("handles cookie with trailing space in value", () => {
		expect(parseInviteCodeFromCookie("other=val; ba-invite-code=code123", "ba-invite-code")).toBe("code123");
	});

	it("handles custom cookie names", () => {
		expect(parseInviteCodeFromCookie("my_app_invite=hello", "my_app_invite")).toBe("hello");
	});

	it("decodes URL-encoded values", () => {
		expect(parseInviteCodeFromCookie("ba-invite-code=abc%20def", "ba-invite-code")).toBe("abc def");
	});

	it("escapes special regex characters in cookie name", () => {
		expect(parseInviteCodeFromCookie("name.with[special]=val", "name.with[special]")).toBe("val");
	});

	it("does not match partial cookie names", () => {
		expect(parseInviteCodeFromCookie("xba-invite-code=wrong", "ba-invite-code")).toBeUndefined();
	});

	it("handles cookie at the start of the string", () => {
		expect(parseInviteCodeFromCookie("ba-invite-code=first; other=second", "ba-invite-code")).toBe("first");
	});
});

describe("buildInviteUrl", () => {
	it("builds URL with base, path, and code", () => {
		expect(buildInviteUrl("https://app.com", "/register", "abc123")).toBe(
			"https://app.com/register?invite=abc123",
		);
	});

	it("strips trailing slash from base URL", () => {
		expect(buildInviteUrl("https://app.com/", "/register", "abc123")).toBe(
			"https://app.com/register?invite=abc123",
		);
	});

	it("adds leading slash to register path", () => {
		expect(buildInviteUrl("https://app.com", "register", "abc123")).toBe(
			"https://app.com/register?invite=abc123",
		);
	});

	it("URL-encodes the invite code", () => {
		expect(buildInviteUrl("https://app.com", "/register", "a b+c")).toBe(
			"https://app.com/register?invite=a%20b%2Bc",
		);
	});

	it("handles custom register paths", () => {
		expect(buildInviteUrl("https://app.com", "/auth/signup", "code")).toBe(
			"https://app.com/auth/signup?invite=code",
		);
	});
});
