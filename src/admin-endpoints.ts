import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import { z } from "zod";
import type { AdminEndpointOptions } from "./admin-helpers";
import { getBaseUrl, makeCode, resolveIsAdmin } from "./admin-helpers";
import { ERROR_CODES, MAX_BATCH_SIZE, MAX_INPUT_LENGTH } from "./constants";
import type {
  CreateInvitationResult,
  Invitation,
  InvitationStats,
  InvitationWithStatus,
} from "./types";
import {
  buildInviteUrl,
  computeInvitationStatus,
  hashInviteCode,
  isDomainAllowed,
} from "./utils";

export function createAdminEndpoints(opts: AdminEndpointOptions) {
  const {
    expiresInSeconds,
    codeLengthBytes,
    customGenerateCode,
    sendInviteEmail,
    customIsAdmin,
    baseUrl,
    registerPath,
    allowedDomains,
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
          maxUses: z.number().int().min(1).max(10_000).default(1),
          metadata: z.record(z.string(), z.any()).optional(),
        }),
      },
      async (ctx) => {
        const admin = await resolveIsAdmin(
          ctx.context.session.user,
          customIsAdmin,
          ctx.context.logger
        );
        if (!admin) {
          throw new APIError("FORBIDDEN", {
            message: ERROR_CODES.ADMIN_REQUIRED,
          });
        }

        if (!isDomainAllowed(ctx.body.email, allowedDomains)) {
          throw new APIError("BAD_REQUEST", {
            message: ERROR_CODES.DOMAIN_NOT_ALLOWED,
          });
        }

        const code = await makeCode(customGenerateCode, codeLengthBytes);
        const codeHash = hashInviteCode(code);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);
        const metadata = ctx.body.metadata ?? null;

        const invitation = (await ctx.context.adapter.create({
          model: "invitation",
          data: {
            email: ctx.body.email,
            codeHash,
            invitedBy: ctx.context.session.user.id,
            maxUses: ctx.body.maxUses,
            useCount: 0,
            usedBy: null,
            usedAt: null,
            revokedAt: null,
            expiresAt,
            createdAt: now,
            metadata: metadata ? JSON.stringify(metadata) : null,
          },
        })) as Invitation;

        const inviteUrl = buildInviteUrl(
          getBaseUrl(ctx, baseUrl),
          registerPath,
          code
        );
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
          maxUses: ctx.body.maxUses,
          metadata,
        } satisfies CreateInvitationResult);
      }
    ),

    createBatchInvitations: createAuthEndpoint(
      "/invite-only/create-batch",
      {
        method: "POST",
        use: [sessionMiddleware],
        body: z.object({
          invitations: z
            .array(
              z.object({
                email: z
                  .string()
                  .email()
                  .max(MAX_INPUT_LENGTH)
                  .transform((e) => e.toLowerCase().trim()),
                sendEmail: z.boolean().default(true),
                maxUses: z.number().int().min(1).max(10_000).default(1),
                metadata: z.record(z.string(), z.any()).optional(),
              })
            )
            .min(1)
            .max(MAX_BATCH_SIZE),
        }),
      },
      async (ctx) => {
        const admin = await resolveIsAdmin(
          ctx.context.session.user,
          customIsAdmin,
          ctx.context.logger
        );
        if (!admin) {
          throw new APIError("FORBIDDEN", {
            message: ERROR_CODES.ADMIN_REQUIRED,
          });
        }

        const results: CreateInvitationResult[] = [];

        for (const item of ctx.body.invitations) {
          if (!isDomainAllowed(item.email, allowedDomains)) {
            throw new APIError("BAD_REQUEST", {
              message: `${ERROR_CODES.DOMAIN_NOT_ALLOWED}: ${item.email}`,
            });
          }

          const code = await makeCode(customGenerateCode, codeLengthBytes);
          const codeHash = hashInviteCode(code);
          const now = new Date();
          const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);
          const metadata = item.metadata ?? null;

          const invitation = (await ctx.context.adapter.create({
            model: "invitation",
            data: {
              email: item.email,
              codeHash,
              invitedBy: ctx.context.session.user.id,
              maxUses: item.maxUses,
              useCount: 0,
              usedBy: null,
              usedAt: null,
              revokedAt: null,
              expiresAt,
              createdAt: now,
              metadata: metadata ? JSON.stringify(metadata) : null,
            },
          })) as Invitation;

          const inviteUrl = buildInviteUrl(
            getBaseUrl(ctx, baseUrl),
            registerPath,
            code
          );
          let emailSent = false;

          if (item.sendEmail && sendInviteEmail) {
            try {
              await sendInviteEmail({
                email: item.email,
                inviteUrl,
                code,
                invitedByName:
                  ctx.context.session.user.name ??
                  ctx.context.session.user.email,
              });
              emailSent = true;
            } catch (err) {
              ctx.context.logger?.error?.("Failed to send invitation email", {
                error: err,
              });
            }
          }

          results.push({
            id: invitation.id,
            code,
            email: item.email,
            inviteUrl,
            expiresAt: expiresAt.toISOString(),
            emailSent,
            maxUses: item.maxUses,
            metadata,
          });
        }

        return ctx.json({ items: results, count: results.length });
      }
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
          ctx.context.logger
        );
        if (!admin) {
          throw new APIError("FORBIDDEN", {
            message: ERROR_CODES.ADMIN_REQUIRED,
          });
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
          metadata: parseMetadata(inv.metadata),
          status: computeInvitationStatus(inv),
        }));

        // "expired" is computed (expiresAt < now AND not used AND not revoked)
        // and cannot be fully expressed in a single adapter where clause,
        // so we filter post-fetch. This may result in fewer items than `limit`.
        if (status === "expired") {
          withStatus = withStatus.filter((inv) => inv.status === "expired");
        }

        const nextCursor = hasMore
          ? items.at(-1)?.createdAt?.toISOString()
          : undefined;
        return ctx.json({ items: withStatus, nextCursor });
      }
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
          ctx.context.logger
        );
        if (!admin) {
          throw new APIError("FORBIDDEN", {
            message: ERROR_CODES.ADMIN_REQUIRED,
          });
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
      }
    ),

    deleteInvitation: createAuthEndpoint(
      "/invite-only/delete",
      {
        method: "POST",
        use: [sessionMiddleware],
        body: z.object({ id: z.string().min(1).max(MAX_INPUT_LENGTH) }),
      },
      async (ctx) => {
        const admin = await resolveIsAdmin(
          ctx.context.session.user,
          customIsAdmin,
          ctx.context.logger
        );
        if (!admin) {
          throw new APIError("FORBIDDEN", {
            message: ERROR_CODES.ADMIN_REQUIRED,
          });
        }

        const invitation = (await ctx.context.adapter.findOne({
          model: "invitation",
          where: [{ field: "id", value: ctx.body.id }],
        })) as Invitation | null;

        if (!invitation) {
          throw new APIError("NOT_FOUND", { message: ERROR_CODES.NOT_FOUND });
        }

        await ctx.context.adapter.delete({
          model: "invitation",
          where: [{ field: "id", value: ctx.body.id }],
        });

        return ctx.json({ success: true });
      }
    ),
  };
}

function parseMetadata(value: any): Record<string, any> | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value as Record<string, any>;
}
