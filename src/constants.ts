/** TTL for pending invite entries in the in-memory map (5 minutes). */
export const PENDING_TTL_MS = 5 * 60 * 1000;

/** Maximum number of entries in the pending invites map before forced cleanup. */
export const PENDING_MAX_SIZE = 10_000;

/** Default invitation expiry: 7 days in seconds. */
export const DEFAULT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

/** Default cookie name for OAuth invite code transport. */
export const DEFAULT_COOKIE_NAME = "ba-invite-code";

/** Default register path. */
export const DEFAULT_REGISTER_PATH = "/register";

/** Default random bytes for code generation (output is 2x in hex chars). */
export const DEFAULT_CODE_LENGTH_BYTES = 16;

/** Maximum allowed input length for string fields (prevents abuse). */
export const MAX_INPUT_LENGTH = 256;

/** Maximum number of invitations per batch create call. */
export const MAX_BATCH_SIZE = 50;

import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const ERROR_CODES = defineErrorCodes({
  INVITE_REQUIRED: "Invitation code required",
  INVALID_INVITE: "Invalid or expired invitation code",
  INVITE_EXPIRED: "Invitation code expired",
  ADMIN_REQUIRED: "Admin access required",
  EMAIL_MISMATCH: "This invitation code is for a different email address",
  ALREADY_USED: "Cannot revoke a used invitation",
  ALREADY_REVOKED: "Invitation already revoked",
  NOT_FOUND: "Invitation not found",
  NO_LONGER_VALID: "Invitation is no longer valid",
  EMAIL_NOT_CONFIGURED: "Email sending not configured",
  DOMAIN_NOT_ALLOWED: "Email domain is not allowed",
  INVITE_EXHAUSTED: "Invitation has reached maximum uses",
  BATCH_EMPTY: "At least one invitation is required",
  TOO_MANY_PENDING: "Too many pending signups. Please try again later.",
  EMAIL_SEND_FAILED: "Failed to send email",
});
