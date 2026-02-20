import type { BetterAuthPlugin } from "better-auth";
import { createAdminEndpoints } from "./admin-endpoints";
import { createAdminMutations } from "./admin-mutations";
import {
	DEFAULT_COOKIE_MAX_AGE,
	DEFAULT_COOKIE_NAME,
	DEFAULT_CODE_LENGTH_BYTES,
	DEFAULT_EXPIRES_IN_SECONDS,
	DEFAULT_REGISTER_PATH,
	ERROR_CODES,
} from "./constants";
import { createAfterHooks, createBeforeHooks, startCleanupInterval } from "./hooks";
import { createPublicEndpoints } from "./public-endpoints";
import type { InviteOnlyPluginOptions } from "./types";

export type {
	CreateInvitationResult,
	Invitation,
	InvitationStats,
	InvitationWithStatus,
	InviteOnlyPluginOptions,
	ResendInvitationResult,
} from "./types";
export {
	buildInviteUrl,
	computeInvitationStatus,
	generateInviteCode,
	hashInviteCode,
	isInvitationValid,
	maskEmail,
} from "./utils";
export { ERROR_CODES } from "./constants";
export { __pendingInvites } from "./hooks";

export const inviteOnly = (options: InviteOnlyPluginOptions = {}) => {
	const {
		enabled = true,
		expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS,
		codeLengthBytes = DEFAULT_CODE_LENGTH_BYTES,
		generateCode: customGenerateCode,
		cookieName = DEFAULT_COOKIE_NAME,
		cookieMaxAge = DEFAULT_COOKIE_MAX_AGE,
		sendInviteEmail,
		isAdmin: customIsAdmin,
		baseUrl,
		registerPath = DEFAULT_REGISTER_PATH,
		protectedPaths = {},
	} = options;

	const emailSignupPath = protectedPaths.emailSignup ?? "/sign-up/email";
	const interceptOauth = protectedPaths.oauthCallbacks ?? true;
	const oauthPrefix = protectedPaths.oauthCallbackPrefix ?? "/callback/";

	const endpointOpts = {
		expiresInSeconds,
		codeLengthBytes,
		customGenerateCode,
		sendInviteEmail,
		customIsAdmin,
		baseUrl,
		registerPath,
	};

	const adminEndpoints = createAdminEndpoints(endpointOpts);
	const adminMutations = createAdminMutations(endpointOpts);
	const publicEndpoints = createPublicEndpoints({ enabled });

	return {
		id: "invite-only",

		init: async () => {
			startCleanupInterval();
		},

		schema: {
			invitation: {
				fields: {
					email: { type: "string" as const, required: true, index: true },
					codeHash: {
						type: "string" as const,
						required: true,
						unique: true,
						returned: false,
					},
					invitedBy: {
						type: "string" as const,
						required: true,
						references: { model: "user", field: "id" },
					},
					usedBy: {
						type: "string" as const,
						required: false,
						references: { model: "user", field: "id" },
					},
					usedAt: { type: "date" as const, required: false },
					revokedAt: { type: "date" as const, required: false },
					expiresAt: { type: "date" as const, required: true, index: true },
					createdAt: { type: "date" as const, required: true, index: true },
				},
			},
		},

		hooks: {
			before: createBeforeHooks({
				enabled,
				emailSignupPath,
				interceptOauth,
				oauthPrefix,
				cookieName,
			}),
			after: createAfterHooks({
				emailSignupPath,
				oauthPrefix,
				cookieName,
			}),
		},

		endpoints: {
			...adminEndpoints,
			...adminMutations,
			...publicEndpoints,
		},

		$ERROR_CODES: ERROR_CODES,

		rateLimit: [
			{
				pathMatcher: (path: string) => path === "/invite-only/validate",
				max: 10,
				window: 60,
			},
			{
				pathMatcher: (path: string) => path === "/invite-only/create",
				max: 20,
				window: 60,
			},
			{
				pathMatcher: (path: string) => path === "/invite-only/resend",
				max: 10,
				window: 60,
			},
		],
	} satisfies BetterAuthPlugin;
};
