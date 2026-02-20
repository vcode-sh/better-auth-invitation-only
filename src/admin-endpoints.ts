import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { z } from "zod";
import type { AdminEndpointOptions } from "./admin-helpers";
import { getBaseUrl, makeCode, resolveIsAdmin } from "./admin-helpers";
import { ERROR_CODES, MAX_INPUT_LENGTH } from "./constants";
import type {
	CreateInvitationResult,
	Invitation,
	InvitationStats,
	InvitationWithStatus,
} from "./types";
import { buildInviteUrl, computeInvitationStatus, hashInviteCode } from "./utils";

export function createAdminEndpoints(opts: AdminEndpointOptions) {
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
		createInvitation: createAuthEndpoint(
			"/invite-only/create",
			{
				method: "POST",
				use: [sessionMiddleware],
				body: z.object({
					email: z
						.string()
						.email()
						.max(MAX_INPUT_LENGTH)
						.transform((e) => e.toLowerCase().trim()),
					sendEmail: z.boolean().default(true),
				}),
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

				const code = await makeCode(customGenerateCode, codeLengthBytes);
				const codeHash = hashInviteCode(code);
				const now = new Date();
				const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);

				const invitation = (await ctx.context.adapter.create({
					model: "invitation",
					data: {
						email: ctx.body.email,
						codeHash,
						invitedBy: ctx.context.session.user.id,
						usedBy: null,
						usedAt: null,
						revokedAt: null,
						expiresAt,
						createdAt: now,
					},
				})) as Invitation;

				const inviteUrl = buildInviteUrl(getBaseUrl(ctx, baseUrl), registerPath, code);
				let emailSent = false;

				if (ctx.body.sendEmail && sendInviteEmail) {
					try {
						await sendInviteEmail({
							email: ctx.body.email,
							inviteUrl,
							code,
							invitedByName:
								ctx.context.session.user.name ?? ctx.context.session.user.email,
						});
						emailSent = true;
					} catch (err) {
						ctx.context.logger?.error?.("Failed to send invitation email", {
							error: err,
						});
					}
				}

				return ctx.json({
					id: invitation.id,
					code,
					email: ctx.body.email,
					inviteUrl,
					expiresAt: expiresAt.toISOString(),
					emailSent,
				} satisfies CreateInvitationResult);
			},
		),

		listInvitations: createAuthEndpoint(
			"/invite-only/list",
			{
				method: "GET",
				use: [sessionMiddleware],
				query: z.object({
					status: z
						.enum(["all", "pending", "used", "expired", "revoked"])
						.default("all"),
					limit: z.coerce.number().min(1).max(100).default(50),
					cursor: z.string().datetime().optional(),
				}),
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

				const where: any[] = [];
				if (ctx.query.cursor) {
					where.push({
						field: "createdAt",
						operator: "lt",
						value: new Date(ctx.query.cursor),
					});
				}

				const status = ctx.query.status;
				if (status === "used") {
					where.push({ field: "usedAt", operator: "ne", value: null });
				} else if (status === "revoked") {
					where.push({ field: "revokedAt", operator: "ne", value: null });
				} else if (status === "pending") {
					where.push({ field: "usedAt", value: null });
					where.push({ field: "revokedAt", value: null });
					where.push({ field: "expiresAt", operator: "gt", value: new Date() });
				}

				const invitations = (await ctx.context.adapter.findMany({
					model: "invitation",
					where: where.length > 0 ? where : undefined,
					sortBy: { field: "createdAt", direction: "desc" },
					limit: ctx.query.limit + 1,
				})) as Invitation[];

				const hasMore = invitations.length > ctx.query.limit;
				const items = hasMore
					? invitations.slice(0, ctx.query.limit)
					: invitations;

				let withStatus: InvitationWithStatus[] = items.map((inv) => ({
					...inv,
					status: computeInvitationStatus(inv),
				}));

				if (status === "expired") {
					withStatus = withStatus.filter((inv) => inv.status === "expired");
				}

				const nextCursor = hasMore
					? items[items.length - 1]?.createdAt?.toISOString()
					: undefined;
				return ctx.json({ items: withStatus, nextCursor });
			},
		),

		invitationStats: createAuthEndpoint(
			"/invite-only/stats",
			{
				method: "GET",
				use: [sessionMiddleware],
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

				const [total, used, revoked] = await Promise.all([
					ctx.context.adapter.count({ model: "invitation" }),
					ctx.context.adapter.count({
						model: "invitation",
						where: [{ field: "usedAt", operator: "ne", value: null }],
					}),
					ctx.context.adapter.count({
						model: "invitation",
						where: [{ field: "revokedAt", operator: "ne", value: null }],
					}),
				]);

				const expired = await ctx.context.adapter.count({
					model: "invitation",
					where: [
						{ field: "expiresAt", operator: "lt", value: new Date() },
						{ field: "usedAt", value: null },
						{ field: "revokedAt", value: null },
					],
				});

				const pending = Math.max(0, total - used - revoked - expired);

				return ctx.json({
					total,
					pending,
					used,
					expired,
					revoked,
				} satisfies InvitationStats);
			},
		),
	};
}
