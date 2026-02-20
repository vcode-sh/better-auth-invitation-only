import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import { MAX_INPUT_LENGTH } from "./constants";
import type { Invitation, InviteOnlyPluginOptions } from "./types";
import { hashInviteCode, isInvitationValid } from "./utils";

async function resolveEnabled(
  enabled: InviteOnlyPluginOptions["enabled"]
): Promise<boolean> {
  if (typeof enabled === "function") {
    return enabled();
  }
  return enabled ?? true;
}

export function createPublicEndpoints(pluginOptions: {
  enabled: InviteOnlyPluginOptions["enabled"];
}) {
  const { enabled } = pluginOptions;

  return {
    validateInviteCode: createAuthEndpoint(
      "/invite-only/validate",
      {
        method: "POST",
        body: z.object({ code: z.string().min(1).max(MAX_INPUT_LENGTH) }),
      },
      async (ctx) => {
        const codeHash = hashInviteCode(ctx.body.code);
        const invitation = (await ctx.context.adapter.findOne({
          model: "invitation",
          where: [{ field: "codeHash", value: codeHash }],
        })) as Invitation | null;
        const valid = invitation ? isInvitationValid(invitation) : false;
        // Do NOT return email — PII leak on public endpoint
        return ctx.json({
          valid,
          expiresAt: valid ? invitation!.expiresAt.toISOString() : undefined,
        });
      }
    ),

    getInviteConfig: createAuthEndpoint(
      "/invite-only/config",
      { method: "GET" },
      async (ctx) => {
        const active = await resolveEnabled(enabled);
        return ctx.json({ enabled: active });
      }
    ),
  };
}
