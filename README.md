# better-auth-invitation-only

Invite-only registration plugin for [Better Auth](https://better-auth.com). Gate your signups with admin-managed invitation codes.

## Features

- **Invite-gated registration** — block all signups unless a valid invite code is provided
- **Email + OAuth support** — works with email/password signup and social OAuth (Google, GitHub, etc.)
- **Admin CRUD endpoints** — create, list, revoke, and resend invitations via API
- **Runtime toggle** — enable/disable invite-only mode without rebuilding
- **Cursor-paginated listing** — efficiently browse invitations with status filtering
- **Stats endpoint** — aggregate counts (pending, used, expired, revoked)
- **Code validation endpoint** — public endpoint to check code validity before signup
- **Auto-consumption** — invitation is automatically marked as used after successful signup
- **Soft revocation** — revoke invitations while preserving audit trail
- **Email callback** — pluggable email sending (bring your own Resend/Postmark/SES/etc.)
- **Rate limiting** — built-in per-endpoint rate limits
- **Full type safety** — typed client plugin with `$InferServerPlugin`

## Installation

```bash
npm install better-auth-invitation-only
```

## Quick Start

### Server

```typescript
import { betterAuth } from "better-auth";
import { inviteOnly } from "better-auth-invitation-only";

export const auth = betterAuth({
  // ... your config
  plugins: [
    inviteOnly({
      enabled: true,
      expiresInSeconds: 7 * 24 * 60 * 60, // 7 days
      sendInviteEmail: async ({ email, inviteUrl, code }) => {
        // Use your email service (Resend, Postmark, SES, etc.)
        await sendEmail({ to: email, subject: "You're invited!", body: `Join us: ${inviteUrl}` });
      },
    }),
  ],
});
```

### Client

```typescript
import { createAuthClient } from "better-auth/client";
import { inviteOnlyClient } from "better-auth-invitation-only/client";

export const authClient = createAuthClient({
  plugins: [inviteOnlyClient()],
});

// Sign up with invite code
await authClient.signUp.email({
  email: "user@example.com",
  password: "secret",
  name: "User",
  inviteCode: "abc123def456...",
});

// OAuth: set cookie before redirect
authClient.inviteOnly.setInviteCodeCookie("abc123def456...");
await authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" });

// Admin: create invitation
const { code, inviteUrl } = await authClient.inviteOnly.createInvitation({
  email: "newuser@example.com",
  sendEmail: true,
});

// Admin: list invitations
const { items } = await authClient.inviteOnly.listInvitations({ status: "pending" });

// Public: validate code
const { valid } = await authClient.inviteOnly.validateInviteCode("abc123");

// Public: check if invite-only is enabled
const { enabled } = await authClient.inviteOnly.getInviteConfig();
```

## Configuration

See [docs/configuration.md](docs/configuration.md) for all options.

## API Reference

See [docs/api-reference.md](docs/api-reference.md) for all endpoints.

## How It Works

1. Admin creates an invitation via `/invite-only/create` — generates a unique code + optional email
2. User receives invite link: `/register?invite=CODE`
3. On signup, the plugin's before-hook validates the code against the database
4. After successful user creation, the after-hook marks the invitation as consumed
5. For OAuth flows, the invite code is stored in a short-lived cookie before the redirect

## Database Schema

The plugin creates an `invitation` table:

| Column | Type | Description |
|--------|------|-------------|
| id | string | Primary key |
| email | string | Invitee email |
| code | string | Unique invite code |
| invitedBy | string | Admin user ID (FK) |
| usedBy | string? | User who consumed it (FK) |
| usedAt | date? | When consumed |
| revokedAt | date? | Soft-delete timestamp |
| expiresAt | date | Expiry timestamp |
| createdAt | date | Creation timestamp |

Run Better Auth's migration CLI or manage the table manually with your ORM.

## License

MIT - [Vibe Code](https://vcode.sh)
