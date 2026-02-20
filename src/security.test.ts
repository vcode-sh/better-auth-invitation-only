import { describe, it, expect, beforeEach } from "vitest";
import {
	hashInviteCode,
	generateInviteCode,
	maskEmail,
	buildInviteUrl,
	computeInvitationStatus,
	isInvitationValid,
	parseInviteCodeFromCookie,
} from "./utils";
import { __pendingInvites, cleanupPendingInvites } from "./hooks";
import { PENDING_MAX_SIZE, PENDING_TTL_MS } from "./constants";

// ---------------------------------------------------------------------------
// 1. CODE HASHING -- SHA-256 correctness and edge cases
// ---------------------------------------------------------------------------
describe("hashInviteCode - Security", () => {
	it("produces consistent 64-char hex SHA-256 output", () => {
		const hash = hashInviteCode("test-code");
		expect(hash).toBe(hashInviteCode("test-code"));
		expect(hash).toHaveLength(64);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("different inputs produce different hashes", () => {
		expect(hashInviteCode("code-a")).not.toBe(hashInviteCode("code-b"));
	});

	it("empty string, unicode, and null bytes all hash correctly", () => {
		expect(hashInviteCode("")).toMatch(/^[0-9a-f]{64}$/);
		expect(hashInviteCode("\u{1F600}\u4E16\u0627")).toHaveLength(64);
		// Null byte must NOT be silently stripped
		expect(hashInviteCode("abc\0def")).not.toBe(hashInviteCode("abc"));
	});

	it("handles 100K char input without crashing", () => {
		expect(hashInviteCode("x".repeat(100_000))).toHaveLength(64);
	});
});

// ---------------------------------------------------------------------------
// 2. CODE GENERATION ENTROPY
// ---------------------------------------------------------------------------
describe("generateInviteCode - Entropy", () => {
	it("produces 1000 unique codes (no collisions)", () => {
		const codes = new Set<string>();
		for (let i = 0; i < 1000; i++) codes.add(generateInviteCode());
		expect(codes.size).toBe(1000);
	});

	it("default is 32 lowercase hex chars, custom length respected", () => {
		const code = generateInviteCode();
		expect(code).toMatch(/^[0-9a-f]{32}$/);
		expect(generateInviteCode(8)).toHaveLength(16);
	});

	it("lengthBytes=0 produces empty string", () => {
		expect(generateInviteCode(0)).toBe("");
	});

	it("negative lengthBytes throws", () => {
		expect(() => generateInviteCode(-1)).toThrow();
	});
});

// ---------------------------------------------------------------------------
// 3. EMAIL MASKING -- information leakage
// ---------------------------------------------------------------------------
describe("maskEmail - Edge Cases", () => {
	it("masks standard email preserving domain", () => {
		expect(maskEmail("alice@example.com")).toBe("al***@example.com");
	});

	it("single and two char local parts", () => {
		expect(maskEmail("a@x.com")).toBe("a***@x.com");
		expect(maskEmail("ab@x.com")).toBe("ab***@x.com");
	});

	it("returns *** for missing @, empty string, empty local part", () => {
		expect(maskEmail("no-at-sign")).toBe("***");
		expect(maskEmail("")).toBe("***");
		expect(maskEmail("@domain.com")).toBe("***");
	});

	it("BUG: multiple @ signs -- domain is middle part, not actual domain", () => {
		// split("@") destructures to [first, second], third+ discarded
		expect(maskEmail("user@middle@real.com")).toBe("us***@middle");
	});

	it("XSS payload in email leaks < char in masked output", () => {
		const result = maskEmail('<script>alert(1)</script>@evil.com');
		expect(result).toBe("<s***@evil.com");
		expect(result).toContain("<");
	});
});

// ---------------------------------------------------------------------------
// 4. COOKIE PARSING -- injection and manipulation
// ---------------------------------------------------------------------------
describe("parseInviteCodeFromCookie - Security", () => {
	const NAME = "ba-invite-code";

	it("parses normal cookie and returns undefined for missing", () => {
		expect(parseInviteCodeFromCookie("ba-invite-code=abc; o=v", NAME)).toBe("abc");
		expect(parseInviteCodeFromCookie("other=val", NAME)).toBeUndefined();
		expect(parseInviteCodeFromCookie("", NAME)).toBeUndefined();
	});

	it("decodes percent-encoded values including null bytes", () => {
		expect(parseInviteCodeFromCookie("ba-invite-code=abc%00def", NAME)).toBe("abc\0def");
	});

	it("BUG: semicolons in cookie name cause incorrect match (injection)", () => {
		// Regex alternation `(?:^|;\s*)` splits the escaped name on `;`
		// so "evil;ba-invite-code" matches cookie "ba-invite-code" instead
		const result = parseInviteCodeFromCookie(
			"evil;ba-invite-code=stolen",
			"evil;ba-invite-code",
		);
		expect(result).toBe("stolen"); // Should be undefined
	});

	it("BUG: equals in cookie name captures other cookies values", () => {
		// `=` is not a regex special char, escaping is a no-op
		const result = parseInviteCodeFromCookie("name=with=equals=value", "name=with");
		expect(result).toBe("equals=value"); // Should be undefined
	});

	it("double-encoded values decode only once", () => {
		// %2561 -> %61 (not "a")
		expect(parseInviteCodeFromCookie("ba-invite-code=%2561bc", NAME)).toBe("%61bc");
	});

	it("100K char cookie header completes fast (no ReDoS)", () => {
		const long = "x".repeat(100_000);
		const start = performance.now();
		const result = parseInviteCodeFromCookie(`ba-invite-code=${long}; end=1`, NAME);
		expect(performance.now() - start).toBeLessThan(100);
		expect(result).toBe(long);
	});

	it("malformed percent-encoding falls back to raw value", () => {
		expect(parseInviteCodeFromCookie("ba-invite-code=%GGbad", NAME)).toBe("%GGbad");
	});

	it("regex special chars in cookie name are escaped properly", () => {
		expect(parseInviteCodeFromCookie("ba.invite+code=found", "ba.invite+code")).toBe("found");
	});

	it("does not match partial cookie names (prefix attack)", () => {
		expect(parseInviteCodeFromCookie("ba-invite-code-ext=evil", NAME)).toBeUndefined();
	});

	it("first cookie wins when duplicates exist", () => {
		expect(parseInviteCodeFromCookie(
			"ba-invite-code=first; ba-invite-code=second", NAME,
		)).toBe("first");
	});
});

// ---------------------------------------------------------------------------
// 5. INPUT FUZZING -- hostile strings
// ---------------------------------------------------------------------------
describe("Input Fuzzing", () => {
	it("hash survives SQL injection and XSS payloads", () => {
		expect(hashInviteCode("' OR 1=1 --")).toHaveLength(64);
		expect(hashInviteCode('<script>alert("x")</script>')).toHaveLength(64);
	});

	it("buildInviteUrl encodes special chars in code", () => {
		expect(buildInviteUrl("https://a.com", "/r", "a b&c=d"))
			.toBe("https://a.com/r?invite=a%20b%26c%3Dd");
	});

	it("buildInviteUrl rejects javascript: protocol (XSS prevention)", () => {
		expect(() => buildInviteUrl("javascript:alert(1)", "/r", "c"))
			.toThrow("Invalid base URL protocol");
	});

	it("buildInviteUrl passes path traversal through unvalidated", () => {
		expect(buildInviteUrl("https://a.com", "/../../../etc/passwd", "c"))
			.toBe("https://a.com/../../../etc/passwd?invite=c");
	});

	it("buildInviteUrl strips only one trailing slash", () => {
		expect(buildInviteUrl("https://a.com//", "/r", "c"))
			.toBe("https://a.com//r?invite=c");
	});

	it("FIX: NaN expiresAt correctly treated as expired (not permanently valid)", () => {
		const inv = { revokedAt: null, usedAt: null, expiresAt: new Date("invalid") };
		expect(computeInvitationStatus(inv)).toBe("expired");
		expect(isInvitationValid(inv)).toBe(false);
	});

	it("expiresAt exactly now is a timing race (boundary)", () => {
		const now = new Date();
		const valid = isInvitationValid({ usedAt: null, revokedAt: null, expiresAt: now });
		expect(typeof valid).toBe("boolean");
	});

	it("status priority: revoked > used > expired", () => {
		const past = new Date(Date.now() - 1000);
		expect(computeInvitationStatus({
			revokedAt: new Date(), usedAt: new Date(), expiresAt: past,
		})).toBe("revoked");
		expect(computeInvitationStatus({
			revokedAt: null, usedAt: new Date(), expiresAt: past,
		})).toBe("used");
	});
});

// ---------------------------------------------------------------------------
// 6. MEMORY SAFETY -- pendingInvites Map
// ---------------------------------------------------------------------------
describe("pendingInvites - Memory Safety", () => {
	beforeEach(() => __pendingInvites.clear());

	it("cleanup removes entries older than TTL but keeps fresh ones", () => {
		__pendingInvites.set("old@t.com", { invitationId: "1", createdAt: Date.now() - PENDING_TTL_MS - 1000 });
		__pendingInvites.set("new@t.com", { invitationId: "2", createdAt: Date.now() });
		cleanupPendingInvites();
		expect(__pendingInvites.has("old@t.com")).toBe(false);
		expect(__pendingInvites.has("new@t.com")).toBe(true);
	});

	it("BUG: map grows past PENDING_MAX_SIZE when all entries are fresh", () => {
		for (let i = 0; i < PENDING_MAX_SIZE; i++) {
			__pendingInvites.set(`u${i}@t.com`, { invitationId: `${i}`, createdAt: Date.now() });
		}
		// Cleanup removes nothing because all are fresh
		cleanupPendingInvites();
		__pendingInvites.set("overflow@t.com", { invitationId: "x", createdAt: Date.now() });
		// No hard cap -- unbounded memory growth possible
		expect(__pendingInvites.size).toBe(PENDING_MAX_SIZE + 1);
	});

	it("off-by-one: entry at exact TTL boundary survives cleanup (> not >=)", () => {
		__pendingInvites.set("b@t.com", {
			invitationId: "1",
			createdAt: Date.now() - PENDING_TTL_MS, // exactly at boundary
		});
		cleanupPendingInvites();
		expect(__pendingInvites.has("b@t.com")).toBe(true);
	});

	it("concurrent same-email signups: second silently overwrites first", () => {
		__pendingInvites.set("a@t.com", { invitationId: "first", createdAt: Date.now() });
		__pendingInvites.set("a@t.com", { invitationId: "second", createdAt: Date.now() });
		expect(__pendingInvites.get("a@t.com")?.invitationId).toBe("second");
		expect(__pendingInvites.size).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 7. URL BUILDING SAFETY
// ---------------------------------------------------------------------------
describe("buildInviteUrl - Security", () => {
	it("encodes invite code and handles missing leading slash", () => {
		expect(buildInviteUrl("https://a.com", "/r", "abc")).toBe("https://a.com/r?invite=abc");
		expect(buildInviteUrl("https://a.com", "r", "abc")).toBe("https://a.com/r?invite=abc");
	});

	it("encodes unicode in code parameter", () => {
		const url = buildInviteUrl("https://a.com", "/r", "\u{1F600}");
		expect(url).toContain("invite=");
		expect(url).not.toContain("\u{1F600}");
	});

	it("data: URI scheme is rejected (XSS prevention)", () => {
		expect(() => buildInviteUrl("data:text/html,<h1>hi</h1>", "/x", "c"))
			.toThrow("Invalid base URL protocol");
	});

	it("encodes all special URL chars in code", () => {
		expect(buildInviteUrl("https://a.com", "/r", "?foo=bar&x=1#hash"))
			.toBe("https://a.com/r?invite=%3Ffoo%3Dbar%26x%3D1%23hash");
	});

	it("empty base URL produces relative URL", () => {
		expect(buildInviteUrl("", "/r", "c")).toBe("/r?invite=c");
	});
});
