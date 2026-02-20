import { APIError, createAuthMiddleware } from "better-auth/api";
import { createAfterHooks as createAfterHooksImpl } from "./after-hooks";
import { ERROR_CODES } from "./constants";
import { MemoryInviteStore } from "./invite-store";
import type { Invitation, InviteOnlyPluginOptions, InviteStore } from "./types";
import {
  hashInviteCode,
  isDomainAllowed,
  isInvitationValid,
  parseInviteCodeFromCookie,
} from "./utils";

/** @deprecated Use `inviteStore` option instead. Kept for test compat. */
const defaultStore = new MemoryInviteStore();

export { defaultStore as __pendingInvites };

/** @deprecated Use MemoryInviteStore.cleanup() directly. */
export function cleanupPendingInvites(): void {
  defaultStore.cleanup();
}

/** @deprecated Use MemoryInviteStore.startCleanupInterval() directly. */
export function startCleanupInterval(): void {
  defaultStore.startCleanupInterval();
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

export function createBeforeHooks(options: {
  enabled: InviteOnlyPluginOptions["enabled"];
  emailSignupPath: string;
  interceptOauth: boolean;
  oauthPrefix: string;
  cookieName: string;
  allowedDomains?: string[];
  store?: InviteStore;
}) {
  const store = options.store ?? defaultStore;
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

      if (
        signupEmail &&
        !isDomainAllowed(signupEmail, options.allowedDomains)
      ) {
        throw new APIError("FORBIDDEN", {
          message: ERROR_CODES.DOMAIN_NOT_ALLOWED,
        });
      }

      if (store instanceof MemoryInviteStore) {
        store.ensureCapacity();
      }

      if (signupEmail) {
        await store.set(signupEmail, {
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

        if (store instanceof MemoryInviteStore) {
          store.ensureCapacity();
        }

        await store.set(`__code:${inviteCode}`, {
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
  store?: InviteStore;
}) {
  const store = options.store ?? defaultStore;
  return createAfterHooksImpl(store, options);
}
