import { createAuthMiddleware } from "better-auth/api";
import type { Invitation, InviteOnlyPluginOptions, InviteStore } from "./types";
import { parseInviteCodeFromCookie } from "./utils";

export function createAfterHooks(
  store: InviteStore,
  options: {
    emailSignupPath: string;
    oauthPrefix: string;
    cookieName: string;
    onInvitationUsed?: InviteOnlyPluginOptions["onInvitationUsed"];
  }
) {
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
          const entry = await store.get(email);
          if (entry) {
            invitationId = entry.invitationId;
            await store.delete(email);
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
            const entry = await store.get(key);
            if (entry) {
              invitationId = entry.invitationId;
              await store.delete(key);
            }
          }
        }

        if (!invitationId) {
          return;
        }

        try {
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
            const update: Record<string, any> = {
              useCount: newUseCount,
            };
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
            await ctx.context.adapter.update({
              model: "invitation",
              where: [{ field: "id", value: invitationId }],
              update: {
                usedBy: user.id,
                usedAt: new Date(),
                useCount: 1,
              },
            });
          }

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
