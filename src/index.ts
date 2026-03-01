import type { BetterAuthPlugin } from "better-auth";
import { createAdminEndpoints } from "./admin-endpoints";
import { createAdminMutations } from "./admin-mutations";
import { createAdminQueries } from "./admin-queries";
import {
  DEFAULT_CODE_LENGTH_BYTES,
  DEFAULT_COOKIE_NAME,
  DEFAULT_EXPIRES_IN_SECONDS,
  DEFAULT_REGISTER_PATH,
  ERROR_CODES,
} from "./constants";
import { createAfterHooks, createBeforeHooks } from "./hooks";
import { MemoryInviteStore } from "./invite-store";
import { createPublicEndpoints } from "./public-endpoints";
import type { InviteOnlyPluginOptions } from "./types";

export { ERROR_CODES } from "./constants";
export { __pendingInvites } from "./hooks";
export { MemoryInviteStore } from "./invite-store";
export type {
  CreateInvitationResult,
  Invitation,
  InvitationStats,
  InvitationWithStatus,
  InviteOnlyPluginOptions,
  InviteStore,
  InviteStoreEntry,
  ResendInvitationResult,
} from "./types";
export {
  buildInviteUrl,
  computeInvitationStatus,
  generateInviteCode,
  hashInviteCode,
  hashInviteCodeAsync,
  isInvitationValid,
  maskEmail,
  toDate,
} from "./utils";

export const inviteOnly = (options: InviteOnlyPluginOptions = {}) => {
  const {
    enabled = true,
    expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS,
    codeLengthBytes = DEFAULT_CODE_LENGTH_BYTES,
    generateCode: customGenerateCode,
    cookieName = DEFAULT_COOKIE_NAME,
    sendInviteEmail,
    isAdmin: customIsAdmin,
    baseUrl,
    registerPath = DEFAULT_REGISTER_PATH,
    protectedPaths = {},
    onInvitationUsed,
    allowedDomains,
    rateLimits,
    inviteStore: customStore,
  } = options;

  const store = customStore ?? new MemoryInviteStore();

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
    allowedDomains,
  };

  const adminEndpoints = createAdminEndpoints(endpointOpts);
  const adminMutations = createAdminMutations(endpointOpts);
  const adminQueries = createAdminQueries(endpointOpts);
  const publicEndpoints = createPublicEndpoints({ enabled });

  return {
    id: "invite-only",

    init: async (ctx) => {
      if (store instanceof MemoryInviteStore) {
        store.startCleanupInterval();
        if (
          typeof process !== "undefined" &&
          process.env?.NODE_ENV === "production"
        ) {
          (ctx as any)?.context?.logger?.warn?.(
            "invite-only: Using in-memory invite store. Not suitable for multi-process or serverless deployments. Provide a custom inviteStore option."
          );
        }
      }
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
          maxUses: {
            type: "number" as const,
            required: true,
            defaultValue: 1,
          },
          useCount: {
            type: "number" as const,
            required: true,
            defaultValue: 0,
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
          metadata: { type: "string" as const, required: false },
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
        allowedDomains,
        store,
      }),
      after: createAfterHooks({
        emailSignupPath,
        oauthPrefix,
        cookieName,
        onInvitationUsed,
        store,
      }),
    },

    endpoints: {
      ...adminEndpoints,
      ...adminQueries,
      ...adminMutations,
      ...publicEndpoints,
    },

    $ERROR_CODES: ERROR_CODES,

    rateLimit: [
      {
        pathMatcher: (path: string) => path === "/invite-only/validate",
        max: rateLimits?.validate?.max ?? 10,
        window: rateLimits?.validate?.window ?? 60,
      },
      {
        pathMatcher: (path: string) =>
          path === "/invite-only/create" ||
          path === "/invite-only/create-batch",
        max: rateLimits?.create?.max ?? 20,
        window: rateLimits?.create?.window ?? 60,
      },
      {
        pathMatcher: (path: string) => path === "/invite-only/resend",
        max: rateLimits?.resend?.max ?? 10,
        window: rateLimits?.resend?.window ?? 60,
      },
    ],
  } satisfies BetterAuthPlugin;
};

declare module "@better-auth/core" {
  interface BetterAuthPluginRegistry<AuthOptions, Options> {
    "invite-only": {
      creator: typeof inviteOnly;
    };
  }
}
