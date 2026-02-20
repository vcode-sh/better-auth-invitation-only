import { APIError, createAuthMiddleware } from "better-auth/api";
import { ERROR_CODES, PENDING_MAX_SIZE, PENDING_TTL_MS } from "./constants";
import type { Invitation, InviteOnlyPluginOptions } from "./types";
import {
  hashInviteCode,
  isDomainAllowed,
  isInvitationValid,
  parseInviteCodeFromCookie,
} from "./utils";

interface PendingEntry {
  createdAt: number;
  invitationId: string;
}

const pendingInvites = new Map<string, PendingEntry>();

export { pendingInvites as __pendingInvites };

export function cleanupPendingInvites(): void {
  const now = Date.now();
  for (const [key, entry] of pendingInvites) {
    if (now - entry.createdAt > PENDING_TTL_MS) {
      pendingInvites.delete(key);
    }
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startCleanupInterval(): void {
  if (cleanupInterval) {
    return;
  }
  cleanupInterval = setInterval(cleanupPendingInvites, 60_000);
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

async function findInvitationByCodeHash(
  adapter: any,
  codeHash: string
): Promise<Invitation | null> {
  return adapter.findOne({
    model: "invitation",
    where: [{ field: "codeHash", value: codeHash }],
  }) as Promise<Invitation | null>;
}

async function resolveEnabled(
  enabled: InviteOnlyPluginOptions["enabled"]
): Promise<boolean> {
  if (typeof enabled === "function") {
    return enabled();
  }
  return enabled ?? true;
}

function ensureMapCapacity(): void {
  if (pendingInvites.size >= PENDING_MAX_SIZE) {
    cleanupPendingInvites();
    if (pendingInvites.size >= PENDING_MAX_SIZE) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many pending signups. Please try again later.",
      });
    }
  }
}

export function createBeforeHooks(options: {
  enabled: InviteOnlyPluginOptions["enabled"];
  emailSignupPath: string;
  interceptOauth: boolean;
  oauthPrefix: string;
  cookieName: string;
  allowedDomains?: string[];
}) {
  const hooks: any[] = [];

  // Email signup gate
  hooks.push({
    matcher: (context: any) => context.path === options.emailSignupPath,
    handler: createAuthMiddleware(async (ctx) => {
      const active = await resolveEnabled(options.enabled);
      if (!active) {
        return;
      }

      const body = ctx.body as Record<string, any>;
      const query = (ctx as any).query as Record<string, any> | undefined;
      const inviteCode = (body?.inviteCode ?? query?.inviteCode) as
        | string
        | undefined;
      if (!inviteCode) {
        throw new APIError("FORBIDDEN", {
          message: ERROR_CODES.INVITE_REQUIRED,
        });
      }

      const codeHash = hashInviteCode(inviteCode);
      const invitation = await findInvitationByCodeHash(
        ctx.context.adapter,
        codeHash
      );
      if (!(invitation && isInvitationValid(invitation))) {
        throw new APIError("FORBIDDEN", {
          message: ERROR_CODES.INVALID_INVITE,
        });
      }

      // Email binding: if invitation targets a specific email, enforce match
      const signupEmail = (body.email as string)?.toLowerCase().trim();
      if (
        signupEmail &&
        invitation.email &&
        invitation.email.toLowerCase() !== signupEmail
      ) {
        throw new APIError("FORBIDDEN", {
          message: ERROR_CODES.EMAIL_MISMATCH,
        });
      }

      // Domain whitelist check
      if (
        signupEmail &&
        !isDomainAllowed(signupEmail, options.allowedDomains)
      ) {
        throw new APIError("FORBIDDEN", {
          message: ERROR_CODES.DOMAIN_NOT_ALLOWED,
        });
      }

      ensureMapCapacity();

      if (signupEmail) {
        pendingInvites.set(signupEmail, {
          invitationId: invitation.id,
          createdAt: Date.now(),
        });
      }
    }),
  });

  // OAuth callback gate
  if (options.interceptOauth) {
    hooks.push({
      matcher: (context: any) => context.path?.startsWith(options.oauthPrefix),
      handler: createAuthMiddleware(async (ctx) => {
        const active = await resolveEnabled(options.enabled);
        if (!active) {
          return;
        }

        const cookieHeader = ctx.headers?.get?.("cookie") ?? "";
        const inviteCode = parseInviteCodeFromCookie(
          cookieHeader,
          options.cookieName
        );
        if (!inviteCode) {
          throw new APIError("FORBIDDEN", {
            message: ERROR_CODES.INVITE_REQUIRED,
          });
        }

        const codeHash = hashInviteCode(inviteCode);
        const invitation = await findInvitationByCodeHash(
          ctx.context.adapter,
          codeHash
        );
        if (!(invitation && isInvitationValid(invitation))) {
          throw new APIError("FORBIDDEN", {
            message: ERROR_CODES.INVALID_INVITE,
          });
        }

        ensureMapCapacity();

        // Use specific code as key to avoid cross-user collisions
        pendingInvites.set(`__code:${inviteCode}`, {
          invitationId: invitation.id,
          createdAt: Date.now(),
        });
      }),
    });
  }

  return hooks;
}

export function createAfterHooks(options: {
  emailSignupPath: string;
  oauthPrefix: string;
  cookieName: string;
  onInvitationUsed?: InviteOnlyPluginOptions["onInvitationUsed"];
}) {
  return [
    {
      matcher: (context: any) =>
        context.path === options.emailSignupPath ||
        context.path?.startsWith(options.oauthPrefix),
      handler: createAuthMiddleware(async (ctx) => {
        const user =
          (ctx.context as any).newUser ?? (ctx.context as any).returned?.user;
        if (!user?.id) {
          return;
        }

        const email = user.email?.toLowerCase();
        let invitationId: string | undefined;

        // Try email-keyed entry first (email signup)
        if (email) {
          const entry = pendingInvites.get(email);
          if (entry) {
            invitationId = entry.invitationId;
            pendingInvites.delete(email);
          }
        }

        // For OAuth, match specific code from cookie
        if (!invitationId) {
          const cookieHeader = ctx.headers?.get?.("cookie") ?? "";
          const inviteCode = parseInviteCodeFromCookie(
            cookieHeader,
            options.cookieName
          );
          if (inviteCode) {
            const key = `__code:${inviteCode}`;
            const entry = pendingInvites.get(key);
            if (entry) {
              invitationId = entry.invitationId;
              pendingInvites.delete(key);
            }
          }
        }

        if (!invitationId) {
          return;
        }

        try {
          // Load the full invitation for multi-use logic
          const invitation = (await ctx.context.adapter.findOne({
            model: "invitation",
            where: [{ field: "id", value: invitationId }],
          })) as Invitation | null;

          if (!invitation) {
            return;
          }

          const isMultiUse = (invitation.maxUses ?? 1) > 1;
          const newUseCount = (invitation.useCount ?? 0) + 1;

          if (isMultiUse) {
            // Multi-use: increment useCount, set usedAt/usedBy only at limit
            const update: Record<string, any> = { useCount: newUseCount };
            if (newUseCount >= invitation.maxUses) {
              update.usedAt = new Date();
              update.usedBy = user.id;
            }
            await ctx.context.adapter.update({
              model: "invitation",
              where: [{ field: "id", value: invitationId }],
              update,
            });
          } else {
            // Single-use: mark as consumed immediately
            await ctx.context.adapter.update({
              model: "invitation",
              where: [{ field: "id", value: invitationId }],
              update: { usedBy: user.id, usedAt: new Date(), useCount: 1 },
            });
          }

          // Fire onInvitationUsed callback
          if (options.onInvitationUsed) {
            try {
              await options.onInvitationUsed({ invitation, user });
            } catch (err) {
              ctx.context.logger?.error?.("onInvitationUsed callback failed", {
                error: err,
              });
            }
          }
        } catch (err) {
          ctx.context.logger?.error?.("Failed to consume invitation", {
            invitationId,
            userId: user.id,
            error: err,
          });
        }
      }),
    },
  ];
}
