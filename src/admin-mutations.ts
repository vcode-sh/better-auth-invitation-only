import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { z } from "zod";
import type { AdminEndpointOptions } from "./admin-helpers";
import { getBaseUrl, makeCode, resolveIsAdmin } from "./admin-helpers";
import { ERROR_CODES, MAX_INPUT_LENGTH } from "./constants";
import type { Invitation, ResendInvitationResult } from "./types";
import { buildInviteUrl, hashInviteCode, isInvitationValid } from "./utils";

export function createAdminMutations(opts: AdminEndpointOptions) {
	const {
		expiresInSeconds,
		codeLengthBytes,
		customGenerateCode,
		sendInviteEmail,
		customIsAdmin,
		baseUrl,
		registerPath,
	} = opts;

	return {
		revokeInvitation: createAuthEndpoint(
			"/invite-only/revoke",
			{
				method: "POST",
				use: [sessionMiddleware],
				body: z.object({ id: z.string().min(1).max(MAX_INPUT_LENGTH) }),
			},
			async (ctx) => {
				const admin = await resolveIsAdmin(
					ctx.context.session.user,
					customIsAdmin,
					ctx.context.logger,
				);
				if (!admin) {
					throw new APIError("FORBIDDEN", { message: ERROR_CODES.ADMIN_REQUIRED });
				}

				const invitation = (await ctx.context.adapter.findOne({
					model: "invitation",
					where: [{ field: "id", value: ctx.body.id }],
				})) as Invitation | null;

				if (!invitation) {
					throw new APIError("NOT_FOUND", { message: ERROR_CODES.NOT_FOUND });
				}
				if (invitation.usedAt) {
					throw new APIError("BAD_REQUEST", { message: ERROR_CODES.ALREADY_USED });
				}
				if (invitation.revokedAt) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.ALREADY_REVOKED,
					});
				}

				await ctx.context.adapter.update({
					model: "invitation",
					where: [{ field: "id", value: ctx.body.id }],
					update: { revokedAt: new Date() },
				});

				return ctx.json({ success: true });
			},
		),

		resendInvitation: createAuthEndpoint(
			"/invite-only/resend",
			{
				method: "POST",
				use: [sessionMiddleware],
				body: z.object({ id: z.string().min(1).max(MAX_INPUT_LENGTH) }),
			},
			async (ctx) => {
				const admin = await resolveIsAdmin(
					ctx.context.session.user,
					customIsAdmin,
					ctx.context.logger,
				);
				if (!admin) {
					throw new APIError("FORBIDDEN", { message: ERROR_CODES.ADMIN_REQUIRED });
				}

				if (!sendInviteEmail) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.EMAIL_NOT_CONFIGURED,
					});
				}

				const invitation = (await ctx.context.adapter.findOne({
					model: "invitation",
					where: [{ field: "id", value: ctx.body.id }],
				})) as Invitation | null;

				if (!invitation) {
					throw new APIError("NOT_FOUND", { message: ERROR_CODES.NOT_FOUND });
				}
				if (!isInvitationValid(invitation)) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.NO_LONGER_VALID,
					});
				}

				// Original code is not stored (only hash). Revoke old + create new.
				await ctx.context.adapter.update({
					model: "invitation",
					where: [{ field: "id", value: invitation.id }],
					update: { revokedAt: new Date() },
				});

				const code = await makeCode(customGenerateCode, codeLengthBytes);
				const codeHash = hashInviteCode(code);
				const now = new Date();
				const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);

				const newInvitation = (await ctx.context.adapter.create({
					model: "invitation",
					data: {
						email: invitation.email,
						codeHash,
						invitedBy: ctx.context.session.user.id,
						usedBy: null,
						usedAt: null,
						revokedAt: null,
						expiresAt,
						createdAt: now,
					},
				})) as Invitation;

				const inviteUrl = buildInviteUrl(
					getBaseUrl(ctx, baseUrl),
					registerPath,
					code,
				);

				try {
					await sendInviteEmail({
						email: invitation.email,
						inviteUrl,
						code,
						invitedByName:
							ctx.context.session.user.name ?? ctx.context.session.user.email,
					});
				} catch (err) {
					ctx.context.logger?.error?.("Failed to resend invitation email", {
						error: err,
					});
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "Failed to send email",
					});
				}

				return ctx.json({
					success: true,
					newInvitationId: newInvitation.id,
					inviteUrl,
				} satisfies ResendInvitationResult);
			},
		),
	};
}
