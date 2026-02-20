import type { BetterFetchOption } from "@better-fetch/fetch";
import type { BetterAuthClientPlugin } from "better-auth/client";
import type { inviteOnly } from "./index";

type InviteOnlyPlugin = typeof inviteOnly;

export const inviteOnlyClient = () => {
  return {
    id: "invite-only",
    $InferServerPlugin: {} as ReturnType<InviteOnlyPlugin>,

    getActions: ($fetch: any, $store: any, _options: any) => ({
      /**
       * Create a new invitation (admin only).
       */
      createInvitation: async (
        params: {
          email: string;
          sendEmail?: boolean;
          maxUses?: number;
          metadata?: Record<string, any>;
        },
        fetchOptions?: BetterFetchOption
      ) => {
        const res = await $fetch("/invite-only/create", {
          method: "POST",
          body: params,
          ...fetchOptions,
        });
        return res;
      },

      /**
       * Create multiple invitations at once (admin only).
       */
      createBatchInvitations: async (
        params: {
          invitations: Array<{
            email: string;
            sendEmail?: boolean;
            maxUses?: number;
            metadata?: Record<string, any>;
          }>;
        },
        fetchOptions?: BetterFetchOption
      ) => {
        const res = await $fetch("/invite-only/create-batch", {
          method: "POST",
          body: params,
          ...fetchOptions,
        });
        return res;
      },

      /**
       * Delete an invitation permanently (admin only).
       */
      deleteInvitation: async (
        params: { id: string },
        fetchOptions?: BetterFetchOption
      ) => {
        const res = await $fetch("/invite-only/delete", {
          method: "POST",
          body: params,
          ...fetchOptions,
        });
        return res;
      },

      /**
       * List invitations with optional status filter and cursor pagination (admin only).
       */
      listInvitations: async (
        params: {
          status?: "all" | "pending" | "used" | "expired" | "revoked";
          limit?: number;
          cursor?: string;
        } = {},
        fetchOptions?: BetterFetchOption
      ) => {
        const query = new URLSearchParams();
        if (params.status) {
          query.set("status", params.status);
        }
        if (params.limit) {
          query.set("limit", String(params.limit));
        }
        if (params.cursor) {
          query.set("cursor", params.cursor);
        }

        const qs = query.toString();
        const res = await $fetch(`/invite-only/list${qs ? `?${qs}` : ""}`, {
          method: "GET",
          ...fetchOptions,
        });
        return res;
      },

      /**
       * Revoke an invitation (admin only). Soft-delete via revokedAt timestamp.
       */
      revokeInvitation: async (
        params: { id: string },
        fetchOptions?: BetterFetchOption
      ) => {
        const res = await $fetch("/invite-only/revoke", {
          method: "POST",
          body: params,
          ...fetchOptions,
        });
        return res;
      },

      /**
       * Resend invitation — revokes the old one and creates a new invitation with a fresh code.
       */
      resendInvitation: async (
        params: { id: string },
        fetchOptions?: BetterFetchOption
      ) => {
        const res = await $fetch("/invite-only/resend", {
          method: "POST",
          body: params,
          ...fetchOptions,
        });
        return res;
      },

      /**
       * Validate an invite code (public endpoint).
       * Returns whether the code is valid and its associated email.
       */
      validateInviteCode: async (
        params: { code: string },
        fetchOptions?: BetterFetchOption
      ) => {
        const res = await $fetch("/invite-only/validate", {
          method: "POST",
          body: params,
          ...fetchOptions,
        });
        return res;
      },

      /**
       * Get invitation stats (admin only).
       */
      getInvitationStats: async (fetchOptions?: BetterFetchOption) => {
        const res = await $fetch("/invite-only/stats", {
          method: "GET",
          ...fetchOptions,
        });
        return res;
      },

      /**
       * Get invite-only configuration (public endpoint).
       * Useful for the registration page to know if invite-only mode is active.
       */
      getInviteConfig: async (fetchOptions?: BetterFetchOption) => {
        const res = await $fetch("/invite-only/config", {
          method: "GET",
          ...fetchOptions,
        });
        return res;
      },

      /**
       * Set the invite code cookie before initiating an OAuth redirect.
       * Call this before `authClient.signIn.social(...)` so the code
       * survives the OAuth round-trip.
       *
       * @param code The invite code to store.
       * @param cookieName Cookie name (default: "ba-invite-code").
       * @param maxAge Cookie TTL in seconds (default: 300).
       */
      setInviteCodeCookie: (
        code: string,
        cookieNameOverride?: string,
        maxAge?: number
      ): void => {
        if (typeof document === "undefined") {
          return;
        }
        const name = cookieNameOverride ?? "ba-invite-code";
        const age = maxAge ?? 300;
        const secure =
          typeof location !== "undefined" && location.protocol === "https:"
            ? "; Secure"
            : "";
        document.cookie = `${name}=${encodeURIComponent(code)}; path=/; max-age=${age}; SameSite=Lax${secure}`;
      },

      /**
       * Clear the invite code cookie (e.g., after successful registration).
       */
      clearInviteCodeCookie: (cookieNameOverride?: string): void => {
        if (typeof document === "undefined") {
          return;
        }
        const name = cookieNameOverride ?? "ba-invite-code";
        document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
      },
    }),
  } satisfies BetterAuthClientPlugin;
};
