import { describe, expect, it } from "vitest";
import {
  buildInviteUrl,
  computeInvitationStatus,
  generateInviteCode,
  getEmailDomain,
  isDomainAllowed,
  isInvitationValid,
  parseInviteCodeFromCookie,
  toDate,
} from "./utils";

describe("generateInviteCode", () => {
  it("generates a 32-char hex string by default (16 bytes)", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates different codes each time", () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generateInviteCode())
    );
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
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it("returns 'pending' for valid unused invitation", () => {
    expect(
      computeInvitationStatus({
        usedAt: null,
        revokedAt: null,
        expiresAt: future,
      })
    ).toBe("pending");
  });

  it("returns 'used' when usedAt is set", () => {
    expect(
      computeInvitationStatus({
        usedAt: new Date(),
        revokedAt: null,
        expiresAt: future,
      })
    ).toBe("used");
  });

  it("returns 'expired' when past expiresAt", () => {
    expect(
      computeInvitationStatus({
        usedAt: null,
        revokedAt: null,
        expiresAt: past,
      })
    ).toBe("expired");
  });

  it("returns 'revoked' when revokedAt is set", () => {
    expect(
      computeInvitationStatus({
        usedAt: null,
        revokedAt: new Date(),
        expiresAt: future,
      })
    ).toBe("revoked");
  });

  it("revoked takes priority over used", () => {
    expect(
      computeInvitationStatus({
        usedAt: new Date(),
        revokedAt: new Date(),
        expiresAt: future,
      })
    ).toBe("revoked");
  });

  it("revoked takes priority over expired", () => {
    expect(
      computeInvitationStatus({
        usedAt: null,
        revokedAt: new Date(),
        expiresAt: past,
      })
    ).toBe("revoked");
  });

  it("used takes priority over expired", () => {
    expect(
      computeInvitationStatus({
        usedAt: new Date(),
        revokedAt: null,
        expiresAt: past,
      })
    ).toBe("used");
  });

  it("handles Date objects from ISO strings", () => {
    const expiresAt = new Date(new Date(Date.now() + 86_400_000).toISOString());
    expect(
      computeInvitationStatus({ usedAt: null, revokedAt: null, expiresAt })
    ).toBe("pending");
  });
});

describe("isInvitationValid", () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it("returns true for unused, not revoked, not expired", () => {
    expect(
      isInvitationValid({ usedAt: null, revokedAt: null, expiresAt: future })
    ).toBe(true);
  });

  it("returns false when used", () => {
    expect(
      isInvitationValid({
        usedAt: new Date(),
        revokedAt: null,
        expiresAt: future,
      })
    ).toBe(false);
  });

  it("returns false when revoked", () => {
    expect(
      isInvitationValid({
        usedAt: null,
        revokedAt: new Date(),
        expiresAt: future,
      })
    ).toBe(false);
  });

  it("returns false when expired", () => {
    expect(
      isInvitationValid({ usedAt: null, revokedAt: null, expiresAt: past })
    ).toBe(false);
  });

  it("returns false when all conditions are bad", () => {
    expect(
      isInvitationValid({
        usedAt: new Date(),
        revokedAt: new Date(),
        expiresAt: past,
      })
    ).toBe(false);
  });
});

describe("parseInviteCodeFromCookie", () => {
  it("extracts code from simple cookie", () => {
    expect(
      parseInviteCodeFromCookie("ba-invite-code=abc123", "ba-invite-code")
    ).toBe("abc123");
  });

  it("extracts code from multiple cookies", () => {
    const header = "session=xyz; ba-invite-code=mycode; theme=dark";
    expect(parseInviteCodeFromCookie(header, "ba-invite-code")).toBe("mycode");
  });

  it("returns undefined when cookie not found", () => {
    expect(
      parseInviteCodeFromCookie("session=xyz; theme=dark", "ba-invite-code")
    ).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseInviteCodeFromCookie("", "ba-invite-code")).toBeUndefined();
  });

  it("handles cookie with trailing space in value", () => {
    expect(
      parseInviteCodeFromCookie(
        "other=val; ba-invite-code=code123",
        "ba-invite-code"
      )
    ).toBe("code123");
  });

  it("handles custom cookie names", () => {
    expect(
      parseInviteCodeFromCookie("my_app_invite=hello", "my_app_invite")
    ).toBe("hello");
  });

  it("decodes URL-encoded values", () => {
    expect(
      parseInviteCodeFromCookie("ba-invite-code=abc%20def", "ba-invite-code")
    ).toBe("abc def");
  });

  it("escapes special regex characters in cookie name", () => {
    expect(
      parseInviteCodeFromCookie("name.with[special]=val", "name.with[special]")
    ).toBe("val");
  });

  it("does not match partial cookie names", () => {
    expect(
      parseInviteCodeFromCookie("xba-invite-code=wrong", "ba-invite-code")
    ).toBeUndefined();
  });

  it("handles cookie at the start of the string", () => {
    expect(
      parseInviteCodeFromCookie(
        "ba-invite-code=first; other=second",
        "ba-invite-code"
      )
    ).toBe("first");
  });
});

describe("isDomainAllowed", () => {
  it("returns true when allowedDomains is undefined", () => {
    expect(isDomainAllowed("user@example.com", undefined)).toBe(true);
  });

  it("returns true when allowedDomains is empty", () => {
    expect(isDomainAllowed("user@example.com", [])).toBe(true);
  });

  it("returns true when domain matches", () => {
    expect(isDomainAllowed("user@example.com", ["example.com"])).toBe(true);
  });

  it("returns false when domain doesn't match", () => {
    expect(isDomainAllowed("user@other.com", ["example.com"])).toBe(false);
  });

  it("case-insensitive matching", () => {
    expect(isDomainAllowed("user@EXAMPLE.COM", ["example.com"])).toBe(true);
    expect(isDomainAllowed("user@example.com", ["EXAMPLE.COM"])).toBe(true);
  });

  it("supports wildcard *.domain patterns", () => {
    expect(isDomainAllowed("user@sub.example.com", ["*.example.com"])).toBe(
      true
    );
    expect(
      isDomainAllowed("user@deep.sub.example.com", ["*.example.com"])
    ).toBe(true);
    expect(isDomainAllowed("user@example.com", ["*.example.com"])).toBe(true);
    expect(isDomainAllowed("user@other.com", ["*.example.com"])).toBe(false);
  });

  it("handles wildcard with case insensitivity", () => {
    expect(isDomainAllowed("user@SUB.EXAMPLE.COM", ["*.example.com"])).toBe(
      true
    );
    expect(isDomainAllowed("user@sub.example.com", ["*.EXAMPLE.COM"])).toBe(
      true
    );
  });

  it("handles mixed exact and wildcard patterns", () => {
    const domains = ["exact.com", "*.wild.org"];
    expect(isDomainAllowed("user@exact.com", domains)).toBe(true);
    expect(isDomainAllowed("user@sub.wild.org", domains)).toBe(true);
    expect(isDomainAllowed("user@wild.org", domains)).toBe(true);
    expect(isDomainAllowed("user@other.com", domains)).toBe(false);
  });

  it("trims whitespace from domain patterns", () => {
    expect(isDomainAllowed("user@example.com", [" example.com "])).toBe(true);
    expect(isDomainAllowed("user@sub.example.com", [" *.example.com "])).toBe(
      true
    );
  });

  it("handles email with trailing whitespace in domain", () => {
    expect(isDomainAllowed("user@example.com ", ["example.com"])).toBe(true);
  });

  it("handles email with multiple @ signs", () => {
    expect(isDomainAllowed("user@middle@example.com", ["example.com"])).toBe(
      true
    );
  });
});

describe("getEmailDomain", () => {
  it("extracts domain correctly", () => {
    expect(getEmailDomain("user@example.com")).toBe("example.com");
  });

  it("handles email without @ sign", () => {
    expect(getEmailDomain("noemail")).toBe("");
  });

  it("trims trailing whitespace from domain", () => {
    expect(getEmailDomain("user@example.com ")).toBe("example.com");
    expect(getEmailDomain("user@example.com\t")).toBe("example.com");
    expect(getEmailDomain("user@example.com \n")).toBe("example.com");
  });

  it("handles multiple @ signs (uses lastIndexOf)", () => {
    expect(getEmailDomain("user@middle@real.com")).toBe("real.com");
    expect(getEmailDomain("a@b@c@d.com")).toBe("d.com");
  });

  it("lowercases domain", () => {
    expect(getEmailDomain("user@EXAMPLE.COM")).toBe("example.com");
  });

  it("handles empty domain after @", () => {
    expect(getEmailDomain("user@")).toBe("");
  });
});

describe("computeInvitationStatus — multi-use", () => {
  const future = new Date(Date.now() + 86_400_000);

  it("returns 'used' when useCount >= maxUses for multi-use", () => {
    expect(
      computeInvitationStatus({
        usedAt: null,
        revokedAt: null,
        expiresAt: future,
        maxUses: 5,
        useCount: 5,
      })
    ).toBe("used");
    expect(
      computeInvitationStatus({
        usedAt: null,
        revokedAt: null,
        expiresAt: future,
        maxUses: 3,
        useCount: 4,
      })
    ).toBe("used");
  });

  it("returns 'pending' when useCount < maxUses", () => {
    expect(
      computeInvitationStatus({
        usedAt: null,
        revokedAt: null,
        expiresAt: future,
        maxUses: 5,
        useCount: 3,
      })
    ).toBe("pending");
  });
});

describe("isInvitationValid — multi-use", () => {
  const future = new Date(Date.now() + 86_400_000);

  it("returns false when useCount >= maxUses for multi-use", () => {
    expect(
      isInvitationValid({
        usedAt: null,
        revokedAt: null,
        expiresAt: future,
        maxUses: 5,
        useCount: 5,
      })
    ).toBe(false);
    expect(
      isInvitationValid({
        usedAt: null,
        revokedAt: null,
        expiresAt: future,
        maxUses: 3,
        useCount: 10,
      })
    ).toBe(false);
  });

  it("returns true when useCount < maxUses", () => {
    expect(
      isInvitationValid({
        usedAt: null,
        revokedAt: null,
        expiresAt: future,
        maxUses: 5,
        useCount: 2,
      })
    ).toBe(true);
  });
});

describe("buildInviteUrl", () => {
  it("builds URL with base, path, and code", () => {
    expect(buildInviteUrl("https://app.com", "/register", "abc123")).toBe(
      "https://app.com/register?invite=abc123"
    );
  });

  it("strips trailing slash from base URL", () => {
    expect(buildInviteUrl("https://app.com/", "/register", "abc123")).toBe(
      "https://app.com/register?invite=abc123"
    );
  });

  it("adds leading slash to register path", () => {
    expect(buildInviteUrl("https://app.com", "register", "abc123")).toBe(
      "https://app.com/register?invite=abc123"
    );
  });

  it("URL-encodes the invite code", () => {
    expect(buildInviteUrl("https://app.com", "/register", "a b+c")).toBe(
      "https://app.com/register?invite=a%20b%2Bc"
    );
  });

  it("handles custom register paths", () => {
    expect(buildInviteUrl("https://app.com", "/auth/signup", "code")).toBe(
      "https://app.com/auth/signup?invite=code"
    );
  });
});

describe("toDate", () => {
  it("returns the same Date object when given a Date", () => {
    const d = new Date("2024-01-15T12:00:00Z");
    expect(toDate(d)).toBe(d);
  });

  it("parses ISO date strings", () => {
    const result = toDate("2024-01-15T12:00:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe("2024-01-15T12:00:00.000Z");
  });

  it("parses numeric timestamps", () => {
    const ts = 1_705_320_000_000;
    const result = toDate(ts);
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(ts);
  });

  it("returns invalid Date for null", () => {
    const result = toDate(null);
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(true);
  });

  it("returns invalid Date for undefined", () => {
    const result = toDate(undefined);
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(true);
  });

  it("returns invalid Date for non-date objects", () => {
    const result = toDate({ foo: "bar" });
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(true);
  });

  it("returns invalid Date for invalid date string", () => {
    const result = toDate("not-a-date");
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(true);
  });

  it("handles zero timestamp", () => {
    const result = toDate(0);
    expect(result.getTime()).toBe(0);
  });
});
