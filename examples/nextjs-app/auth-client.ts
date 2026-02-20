import { createAuthClient } from "better-auth/client";
import { inviteOnlyClient } from "better-auth-invitation-only/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000",
  plugins: [inviteOnlyClient()],
});
