# better-auth-invitation-only

Your app is not a nightclub, but it should have a bouncer. Invite-only registration plugin for [Better Auth](https://better-auth.com) -- because "open signups" is just another way of saying "please, bots, come ruin everything."

## Features

Not another "it just works" feature list written by someone who's never shipped anything. This one actually does what it says.

- **Invite-gated registration** -- block all signups unless a valid invite code is provided
- **Email + OAuth support** -- works with email/password signup and social OAuth (Google, GitHub, etc.)
- **Multi-use codes** -- create shareable invite links with configurable max uses (1-10,000)
- **Batch invitations** -- create up to 50 invitations in a single API call
- **Admin CRUD endpoints** -- create, list, revoke, resend, and delete invitations via API
- **Domain whitelist** -- restrict signups to specific email domains (supports `*.example.com` wildcards)
- **Custom metadata** -- attach arbitrary data to invitations (team, role, department)
- **Lifecycle callback** -- `onInvitationUsed` fires after signup for post-registration logic
- **Runtime toggle** -- enable/disable invite-only mode without rebuilding
- **Configurable rate limits** -- override default rate limits per endpoint
- **Cursor-paginated listing** -- efficiently browse invitations with status filtering
- **Stats endpoint** -- aggregate counts (pending, used, expired, revoked)
- **Code validation endpoint** -- public endpoint to check code validity before signup
- **SHA-256 code hashing** -- invite codes are never stored in plaintext
- **Auto-consumption** -- invitation is automatically marked as used after successful signup
- **Soft revocation** -- revoke invitations while preserving audit trail
- **Hard delete** -- permanently remove invitation records (GDPR compliance)
- **Email callback** -- pluggable email sending (bring your own Resend/Postmark/SES/etc.)
- **Rate limiting** -- built-in per-endpoint rate limits (configurable)
- **Pluggable invite store** -- swap the default in-memory store for Redis, KV, or any custom backend
- **Web Crypto fallback** -- works in edge runtimes where `node:crypto` isn't available
- **Full type safety** -- typed client plugin with `$InferServerPlugin`

## Installation

One command. No 47-step Medium article required.

```bash
npm install better-auth-invitation-only
```

## Quick Start

### Server

Drop this into your auth config and suddenly you have standards.

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
          body: `Join here: ${inviteUrl}`,
        });
      },
      // Optional: restrict to specific domains (wildcards supported)
      allowedDomains: ["company.com", "*.partner.org"],
      // Optional: custom store for multi-process/serverless
      // inviteStore: new RedisInviteStore(redis),
      // Optional: post-signup callback
      onInvitationUsed: async ({ invitation, user }) => {
        await assignRole(user.id, invitation.metadata?.role);
      },
    }),
  ],
});
```

### Client

The client side. Where hopes and dreams meet `async/await`.

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

Six steps. Fewer than your morning standup, and considerably more useful.

1. Admin creates an invitation via `/invite-only/create` -- generates a unique code, stores SHA-256 hash
2. User receives invite link: `/register?invite=CODE`
3. On signup, the plugin's before-hook validates the code against the database
4. After successful user creation, the after-hook marks the invitation as consumed
5. For OAuth flows, the invite code is stored in a short-lived cookie before the redirect
6. Multi-use codes track `useCount` and are fully consumed when the limit is reached

## Database Schema

The plugin creates an `invitation` table. Yes, it touches your database. No, it won't text your ex.

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

## Compatibility

Works with any framework and database that Better Auth supports. We tested it so you don't have to -- although you probably should anyway, because trust issues are healthy in software engineering.

### Frameworks

The plugin registers endpoints and hooks through Better Auth's plugin API. It's framework-agnostic -- if Better Auth works with your framework, this plugin works too. Tested patterns include Next.js (App Router), Astro, Hono, Express, and TanStack Start.

### Databases

Tested against real adapters:

| Database | Status | Notes |
|----------|--------|-------|
| SQLite (better-sqlite3) | Tested | Full integration test suite |
| MongoDB | Tested | Full integration test suite via mongodb-memory-server |
| PostgreSQL | Supported | Uses standard adapter operations |
| MySQL | Supported | Uses standard adapter operations |

The plugin uses only standard adapter methods (`findOne`, `findMany`, `create`, `update`, `delete`, `count`). Community adapters (Convex, SurrealDB, PocketBase, etc.) should work if they implement these methods. If an adapter doesn't support `count()`, the plugin falls back to `findMany` + length with a performance warning.

### Runtimes

| Runtime | Status | Notes |
|---------|--------|-------|
| Node.js >= 22 | Tested | Primary runtime |
| Bun | Tested | Full test suite passes |
| Cloudflare Workers / Edge | Partial | Code hashing works (Web Crypto fallback). Requires custom `inviteStore` -- the default in-memory store is stateless per invocation. |

### Deployment Modes

| Mode | Default Store | Custom Store Needed? |
|------|---------------|---------------------|
| Single-process Node.js | In-memory Map | No |
| PM2 cluster / multi-process | -- | Yes (Redis, database, etc.) |
| Serverless (Vercel, AWS Lambda) | -- | Yes |
| Edge (Cloudflare Workers) | -- | Yes (KV, D1, etc.) |

For multi-process or serverless, provide a custom `inviteStore`. See [configuration.md](docs/configuration.md#custom-invite-store).

## Security

I take security seriously, which is a sentence that usually precedes a data breach announcement. In this case, though, I actually mean it.

- Invite codes are hashed with SHA-256 before storage -- raw codes are never persisted
- Email binding enforces that the signup email matches the invitation target
- Domain whitelist restricts which email domains can use invitation codes
- Public endpoints never expose PII (no email in validate response)
- Pending invites map has TTL (5 min) and size cap (10K) to prevent memory abuse
- OAuth cookies use `Secure`, `SameSite=Lax`, and short TTL
- All inputs validated with Zod with length limits (max 256 chars)
- Per-endpoint rate limiting prevents brute-force attacks

## Known Limitations

Every project has them. Most just don't admit it.

- **In-memory store is single-process only** -- the default `MemoryInviteStore` uses a process-local Map. In cluster mode or serverless, pending invite entries won't be shared between instances. Provide a custom `inviteStore` for distributed deployments.
- **OAuth invite flow requires cookie support** -- the invite code is passed through a `SameSite=Lax` cookie. Safari ITP may block cookies in cross-domain OAuth redirects. Some frameworks (Next.js, SvelteKit, TanStack Start) need their cookie plugin configured for server-side cookie access.
- **`adapter.count()` with `ne` operator** -- some adapter implementations handle `{ operator: "ne", value: null }` inconsistently. The stats endpoint uses `safeCount()` which falls back to `findMany` + length if `count()` fails.
- **Cursor pagination tie-breaking** -- if two invitations share an identical `createdAt` timestamp (within DB precision), cursor pagination may skip one. This is rare in practice.

## License

MIT - [Vibe Code](https://vcode.sh)
