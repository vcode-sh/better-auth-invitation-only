import { betterAuth } from "better-auth";
import { inviteOnly } from "better-auth-invitation-only";

export const auth = betterAuth({
  database: {
    provider: "pg",
    url: process.env.DATABASE_URL!,
  },
  plugins: [
    inviteOnly({
      enabled: () => process.env.INVITE_ONLY === "true",
      expiresInSeconds: 7 * 24 * 60 * 60,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      sendInviteEmail: async ({ email, inviteUrl, invitedByName }) => {
        // Replace with your email service
        console.log(
          `Sending invite to ${email}: ${inviteUrl} (from ${invitedByName})`
        );
      },
    }),
  ],
});
