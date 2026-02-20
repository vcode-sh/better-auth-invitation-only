/**
 * Configuration options for the invite-only registration plugin.
 */
export interface InviteOnlyPluginOptions {
  /**
   * List of allowed email domains for signup. When set, only emails matching
   * these domains can use invitation codes.
   * Example: `["company.com", "partner.org"]`
   */
  allowedDomains?: string[];

  /**
   * Base URL for generating invite links. Used to construct `/register?invite=CODE`.
   * If not provided, attempts to use Better Auth's configured base URL.
   */
  baseUrl?: string;

  /**
   * Length of the generated hex code in bytes (output is 2x in hex chars).
   * E.g., 16 bytes = 32 hex characters.
   * @default 16
   */
  codeLengthBytes?: number;

  /**
   * Cookie name used to pass invite code through OAuth redirects.
   * @default "ba-invite-code"
   */
  cookieName?: string;
  /**
   * Whether invite-only mode is currently active.
   * When `false`, signups proceed normally without invite codes.
   * Can be a boolean or a function that returns a boolean (for runtime toggling).
   * @default true
   */
  enabled?: boolean | (() => boolean | Promise<boolean>);

  /**
   * How long invitation codes remain valid, in seconds.
   * @default 604800 (7 days)
   */
  expiresInSeconds?: number;

  /**
   * Custom code generator function. If provided, `codeLengthBytes` is ignored.
   * Must return a unique string.
   */
  generateCode?: () => string | Promise<string>;

  /**
   * Callback to determine if the current user can manage invitations.
   * By default, checks for `role === "admin"` on the session user.
   * Provide a custom function for different authorization logic.
   */
  isAdmin?: (user: {
    id: string;
    role?: string;
    [key: string]: any;
  }) => boolean | Promise<boolean>;

  /**
   * Callback fired after an invitation is consumed by a successful signup.
   * Use for post-signup logic (assign role, send welcome email, add to team).
   */
  onInvitationUsed?: (params: OnInvitationUsedParams) => void | Promise<void>;

  /**
   * Paths to intercept for invite validation. Defaults to email signup + OAuth callbacks.
   * Override to add custom signup endpoints.
   */
  protectedPaths?: {
    /** Path for email/password signup. @default "/sign-up/email" */
    emailSignup?: string;
    /** Whether to intercept OAuth callback paths. @default true */
    oauthCallbacks?: boolean;
    /** OAuth callback path prefix. @default "/callback/" */
    oauthCallbackPrefix?: string;
  };

  /**
   * Override default rate limits per endpoint.
   */
  rateLimits?: {
    /** Rate limit for /invite-only/validate. @default { max: 10, window: 60 } */
    validate?: { max: number; window: number };
    /** Rate limit for /invite-only/create. @default { max: 20, window: 60 } */
    create?: { max: number; window: number };
    /** Rate limit for /invite-only/resend. @default { max: 10, window: 60 } */
    resend?: { max: number; window: number };
  };

  /**
   * The URL path where users register. The invite code is appended as `?invite=CODE`.
   * @default "/register"
   */
  registerPath?: string;

  /**
   * Callback to send an invitation email when an admin creates an invitation.
   * If not provided, no email is sent (the admin gets the invite URL to share manually).
   */
  sendInviteEmail?: (params: SendInviteEmailParams) => Promise<void>;
}

export interface SendInviteEmailParams {
  /** The raw invite code. */
  code: string;
  /** Email address of the invitee. */
  email: string;
  /** Display name of the admin who created the invitation. */
  invitedByName?: string;
  /** Full invite URL (e.g., `https://app.com/register?invite=CODE`). */
  inviteUrl: string;
}

export interface OnInvitationUsedParams {
  /** The consumed invitation record. */
  invitation: Invitation;
  /** The newly created user. */
  user: { id: string; email?: string; [key: string]: any };
}

/**
 * Invitation record as stored in the database.
 * The original invite code is never stored — only its SHA-256 hash (`codeHash`).
 */
export interface Invitation {
  codeHash: string;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  invitedBy: string;
  maxUses: number;
  metadata: Record<string, any> | null;
  revokedAt: Date | null;
  useCount: number;
  usedAt: Date | null;
  usedBy: string | null;
}

/**
 * Computed status of an invitation (derived from timestamps, not stored).
 */
export type InvitationStatus = "pending" | "used" | "expired" | "revoked";

/**
 * Stats aggregate returned by the stats endpoint.
 */
export interface InvitationStats {
  expired: number;
  pending: number;
  revoked: number;
  total: number;
  used: number;
}

/**
 * Result returned when creating an invitation.
 */
export interface CreateInvitationResult {
  code: string;
  email: string;
  emailSent: boolean;
  expiresAt: string;
  id: string;
  inviteUrl: string;
  maxUses: number;
  metadata: Record<string, any> | null;
}

/**
 * Result returned when resending an invitation (revokes old, creates new).
 */
export interface ResendInvitationResult {
  inviteUrl: string;
  newInvitationId: string;
  success: true;
}

/**
 * Invitation with computed status for list responses.
 */
export interface InvitationWithStatus extends Invitation {
  status: InvitationStatus;
}
