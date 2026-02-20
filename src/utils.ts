import { createHash, randomBytes } from "node:crypto";
import type { Invitation, InvitationStatus } from "./types";

/**
 * Generate a random hex invitation code.
 * @param lengthBytes Number of random bytes (output is 2x in hex chars).
 */
export function generateInviteCode(lengthBytes = 16): string {
  return randomBytes(lengthBytes).toString("hex");
}

/**
 * Hash an invite code with SHA-256 for secure storage.
 */
export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Mask an email address for safe display (e.g., "to***@example.com").
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!(local && domain)) {
    return "***";
  }
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

/**
 * Compute the display status of an invitation from its timestamps.
 * Priority: revoked > used > exhausted (multi-use at limit) > expired > pending.
 */
export function computeInvitationStatus(
  invitation: Pick<
    Invitation,
    "revokedAt" | "usedAt" | "expiresAt" | "maxUses" | "useCount"
  >
): InvitationStatus {
  if (invitation.revokedAt) {
    return "revoked";
  }
  if (invitation.maxUses > 1) {
    if (invitation.useCount >= invitation.maxUses) {
      return "used";
    }
  } else if (invitation.usedAt) {
    return "used";
  }
  const expiresMs = new Date(invitation.expiresAt).getTime();
  if (Number.isNaN(expiresMs) || expiresMs < Date.now()) {
    return "expired";
  }
  return "pending";
}

/**
 * Check if an invitation is valid for use (not fully used, not revoked, not expired).
 */
export function isInvitationValid(
  invitation: Pick<
    Invitation,
    "usedAt" | "revokedAt" | "expiresAt" | "maxUses" | "useCount"
  >
): boolean {
  if (invitation.revokedAt) {
    return false;
  }
  if (invitation.maxUses > 1) {
    if (invitation.useCount >= invitation.maxUses) {
      return false;
    }
  } else if (invitation.usedAt) {
    return false;
  }
  const expiresMs = new Date(invitation.expiresAt).getTime();
  if (Number.isNaN(expiresMs) || expiresMs < Date.now()) {
    return false;
  }
  return true;
}

/**
 * Parse an invite code from a cookie header string.
 * @param cookieHeader The raw Cookie header value.
 * @param cookieName The name of the cookie to extract.
 */
export function parseInviteCodeFromCookie(
  cookieHeader: string,
  cookieName: string
): string | undefined {
  const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`);
  const match = cookieHeader.match(re);
  const raw = match?.[1]?.trim();
  if (!raw) {
    return undefined;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Build the full invite URL from base URL, register path, and code.
 */
export function buildInviteUrl(
  baseUrl: string,
  registerPath: string,
  code: string
): string {
  // Reject dangerous URI schemes
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    throw new Error(`Invalid base URL protocol: ${baseUrl}`);
  }
  const base = baseUrl.replace(/\/$/, "");
  const path = registerPath.startsWith("/") ? registerPath : `/${registerPath}`;
  return `${base}${path}?invite=${encodeURIComponent(code)}`;
}

/**
 * Extract the domain part from an email address.
 */
export function getEmailDomain(email: string): string {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) {
    return "";
  }
  return email.slice(atIndex + 1).toLowerCase();
}

/**
 * Check if an email's domain is in the allowed domains list.
 */
export function isDomainAllowed(
  email: string,
  allowedDomains?: string[]
): boolean {
  if (!allowedDomains || allowedDomains.length === 0) {
    return true;
  }
  const domain = getEmailDomain(email);
  return allowedDomains.some((d) => d.toLowerCase() === domain);
}
