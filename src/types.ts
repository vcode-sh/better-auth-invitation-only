/**
 * Configuration options for the invite-only registration plugin.
 */
export interface InviteOnlyPluginOptions {
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
	 * Length of the generated hex code in bytes (output is 2x in hex chars).
	 * E.g., 16 bytes = 32 hex characters.
	 * @default 16
	 */
	codeLengthBytes?: number;

	/**
	 * Custom code generator function. If provided, `codeLengthBytes` is ignored.
	 * Must return a unique string.
	 */
	generateCode?: () => string | Promise<string>;

	/**
	 * Cookie name used to pass invite code through OAuth redirects.
	 * @default "ba-invite-code"
	 */
	cookieName?: string;

	/**
	 * Cookie max age in seconds for the OAuth invite code cookie.
	 * @default 300 (5 minutes)
	 */
	cookieMaxAge?: number;

	/**
	 * Callback to send an invitation email when an admin creates an invitation.
	 * If not provided, no email is sent (the admin gets the invite URL to share manually).
	 */
	sendInviteEmail?: (params: SendInviteEmailParams) => Promise<void>;

	/**
	 * Callback to determine if the current user can manage invitations.
	 * By default, checks for `role === "admin"` on the session user.
	 * Provide a custom function for different authorization logic.
	 */
	isAdmin?: (user: { id: string; role?: string; [key: string]: any }) => boolean | Promise<boolean>;

	/**
	 * Base URL for generating invite links. Used to construct `/register?invite=CODE`.
	 * If not provided, attempts to use Better Auth's configured base URL.
	 */
	baseUrl?: string;

	/**
	 * The URL path where users register. The invite code is appended as `?invite=CODE`.
	 * @default "/register"
	 */
	registerPath?: string;

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
}

export interface SendInviteEmailParams {
	/** Email address of the invitee. */
	email: string;
	/** Full invite URL (e.g., `https://app.com/register?invite=CODE`). */
	inviteUrl: string;
	/** The raw invite code. */
	code: string;
	/** Display name of the admin who created the invitation. */
	invitedByName?: string;
}

/**
 * Invitation record as stored in the database.
 * The original invite code is never stored — only its SHA-256 hash (`codeHash`).
 */
export interface Invitation {
	id: string;
	email: string;
	codeHash: string;
	invitedBy: string;
	usedBy: string | null;
	usedAt: Date | null;
	revokedAt: Date | null;
	expiresAt: Date;
	createdAt: Date;
}

/**
 * Computed status of an invitation (derived from timestamps, not stored).
 */
export type InvitationStatus = "pending" | "used" | "expired" | "revoked";

/**
 * Stats aggregate returned by the stats endpoint.
 */
export interface InvitationStats {
	total: number;
	pending: number;
	used: number;
	expired: number;
	revoked: number;
}

/**
 * Result returned when creating an invitation.
 */
export interface CreateInvitationResult {
	id: string;
	code: string;
	email: string;
	inviteUrl: string;
	expiresAt: string;
	emailSent: boolean;
}

/**
 * Result returned when resending an invitation (revokes old, creates new).
 */
export interface ResendInvitationResult {
	success: true;
	newInvitationId: string;
	inviteUrl: string;
}

/**
 * Invitation with computed status for list responses.
 */
export interface InvitationWithStatus extends Invitation {
	status: InvitationStatus;
}
