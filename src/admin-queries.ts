import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import { z } from "zod";
import { safeCount } from "./adapter-helpers";
import type { AdminEndpointOptions } from "./admin-helpers";
import { resolveIsAdmin } from "./admin-helpers";
import { ERROR_CODES } from "./constants";
import type {
  Invitation,
  InvitationStats,
  InvitationWithStatus,
} from "./types";
import { computeInvitationStatus } from "./utils";

export function createAdminQueries(opts: AdminEndpointOptions) {
  const { customIsAdmin } = opts;

  return {
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
          throw APIError.from("FORBIDDEN", ERROR_CODES.ADMIN_REQUIRED);
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
          where.push({
            field: "expiresAt",
            operator: "gt",
            value: new Date(),
          });
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
          throw APIError.from("FORBIDDEN", ERROR_CODES.ADMIN_REQUIRED);
        }

        const logger = ctx.context.logger;

        const [total, used, revoked] = await Promise.all([
          safeCount(adapter(ctx), { model: "invitation" }, logger),
          safeCount(
            adapter(ctx),
            {
              model: "invitation",
              where: [{ field: "usedAt", operator: "ne", value: null }],
            },
            logger
          ),
          safeCount(
            adapter(ctx),
            {
              model: "invitation",
              where: [{ field: "revokedAt", operator: "ne", value: null }],
            },
            logger
          ),
        ]);

        const expired = await safeCount(
          adapter(ctx),
          {
            model: "invitation",
            where: [
              { field: "expiresAt", operator: "lt", value: new Date() },
              { field: "usedAt", value: null },
              { field: "revokedAt", value: null },
            ],
          },
          logger
        );

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
  };
}

function adapter(ctx: any) {
  return ctx.context.adapter;
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
