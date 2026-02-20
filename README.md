# better-auth-invitation-only

Invite-only registration plugin for [Better Auth](https://better-auth.com). Gate your signups with admin-managed invitation codes.

## Features

- **Invite-gated registration** — block all signups unless a valid invite code is provided
- **Email + OAuth support** — works with email/password signup and social OAuth (Google, GitHub, etc.)
- **Multi-use codes** — create shareable invite links with configurable max uses (1-10,000)
- **Batch invitations** — create up to 50 invitations in a single API call
- **Admin CRUD endpoints** — create, list, revoke, resend, and delete invitations via API
- **Domain whitelist** — restrict signups to specific email domains
- **Custom metadata** — attach arbitrary data to invitations (team, role, department)
- **Lifecycle callback** — `onInvitationUsed` fires after signup for post-registration logic
- **Runtime toggle** — enable/disable invite-only mode without rebuilding
- **Configurable rate limits** — override default rate limits per endpoint
- **Cursor-paginated listing** — efficiently browse invitations with status filtering
- **Stats endpoint** — aggregate counts (pending, used, expired, revoked)
- **Code validation endpoint** — public endpoint to check code validity before signup
- **SHA-256 code hashing** — invite codes are never stored in plaintext
- **Auto-consumption** — invitation is automatically marked as used after successful signup
- **Soft revocation** — revoke invitations while preserving audit trail
- **Hard delete** — permanently remove invitation records (GDPR compliance)
- **Email callback** — pluggable email sending (bring your own Resend/Postmark/SES/etc.)
- **Rate limiting** — built-in per-endpoint rate limits (configurable)
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
        await sendEmail({
          to: email,
          subject: "You're invited!",
          body: `Join us: ${inviteUrl}`,
        });
      },
      // Optional: restrict to specific domains
      allowedDomains: ["company.com", "partner.org"],
      // Optional: post-signup callback
      onInvitationUsed: async ({ invitation, user }) => {
        await assignRole(user.id, invitation.metadata?.role);
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
await authClient.signIn.social({
  provider: "google",
  callbackURL: "/dashboard",
});

// Admin: create invitation
const { data } = await authClient.inviteOnly.createInvitation({
  email: "newuser@example.com",
  sendEmail: true,
  maxUses: 10, // multi-use code
  metadata: { team: "engineering", role: "member" },
});

// Admin: batch create
const { data: batch } = await authClient.inviteOnly.createBatchInvitations({
  invitations: [
    { email: "alice@company.com", sendEmail: true },
    { email: "bob@company.com", sendEmail: true, maxUses: 5 },
  ],
});

// Admin: list invitations
const { data: list } = await authClient.inviteOnly.listInvitations({
  status: "pending",
});

// Admin: delete invitation (hard delete)
await authClient.inviteOnly.deleteInvitation({ id: "inv-123" });

// Public: validate code
const { data: check } = await authClient.inviteOnly.validateInviteCode({
  code: "abc123",
});

// Public: check if invite-only is enabled
const { data: config } = await authClient.inviteOnly.getInviteConfig();
```

## Configuration

See [docs/configuration.md](docs/configuration.md) for all options.

## API Reference

See [docs/api-reference.md](docs/api-reference.md) for all endpoints.

## How It Works

1. Admin creates an invitation via `/invite-only/create` -- generates a unique code, stores SHA-256 hash
2. User receives invite link: `/register?invite=CODE`
3. On signup, the plugin's before-hook validates the code against the database
4. After successful user creation, the after-hook marks the invitation as consumed
5. For OAuth flows, the invite code is stored in a short-lived cookie before the redirect
6. Multi-use codes track `useCount` and are fully consumed when the limit is reached

## Database Schema

The plugin creates an `invitation` table:

| Column | Type | Description |
|--------|------|-------------|
| id | string | Primary key |
| email | string | Invitee email |
| codeHash | string | SHA-256 hash of invite code (unique, not returned in API) |
| invitedBy | string | Admin user ID (FK to user) |
| maxUses | number | Maximum number of times this code can be used (default: 1) |
| useCount | number | Number of times this code has been used (default: 0) |
| usedBy | string? | Last user who consumed it (FK to user) |
| usedAt | date? | When fully consumed |
| revokedAt | date? | Soft-delete timestamp |
| expiresAt | date | Expiry timestamp |
| createdAt | date | Creation timestamp |
| metadata | string? | JSON string of custom metadata |

Run Better Auth's migration CLI or manage the table manually with your ORM.

## Security

- Invite codes are hashed with SHA-256 before storage -- raw codes are never persisted
- Email binding enforces that the signup email matches the invitation target
- Domain whitelist restricts which email domains can use invitation codes
- Public endpoints never expose PII (no email in validate response)
- Pending invites map has TTL (5 min) and size cap (10K) to prevent memory abuse
- OAuth cookies use `Secure`, `SameSite=Lax`, and short TTL
- All inputs validated with Zod with length limits (max 256 chars)
- Per-endpoint rate limiting prevents brute-force attacks

## License

MIT - [Vibe Code](https://vcode.sh)
