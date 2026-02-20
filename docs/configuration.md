# Configuration

All options are optional. The defaults are genuinely sensible, not the "I called them sensible so you'd stop asking" kind.

```typescript
inviteOnly({
  // Whether invite-only mode is active.
  // Can be a boolean or async function for runtime toggling.
  // Default: true
  enabled: true,

  // Invitation validity duration in seconds.
  // Default: 604800 (7 days)
  expiresInSeconds: 7 * 24 * 60 * 60,

  // Random bytes for code generation (output is 2x hex chars).
  // Default: 16 (produces 32-char hex codes)
  codeLengthBytes: 16,

  // Custom code generator (overrides codeLengthBytes).
  generateCode: () => nanoid(24),

  // Cookie name for OAuth invite code transport.
  // Default: "ba-invite-code"
  cookieName: "ba-invite-code",

  // Email callback when admin creates an invitation.
  // If not provided, no email is sent (admin shares URL manually).
  sendInviteEmail: async ({ email, inviteUrl, code, invitedByName }) => {
    await resend.emails.send({
      from: "noreply@app.com",
      to: email,
      subject: `${invitedByName} invited you to join`,
      html: `<a href="${inviteUrl}">Accept Invitation</a>`,
    });
  },

  // Custom admin check. Default: user.role === "admin"
  isAdmin: (user) => user.role === "admin" || user.role === "super_admin",

  // Base URL for invite links. Derived from Better Auth config if not set.
  baseUrl: "https://myapp.com",

  // URL path for registration page.
  // Default: "/register"
  registerPath: "/register",

  // Customize which paths are intercepted.
  protectedPaths: {
    emailSignup: "/sign-up/email",     // Default
    oauthCallbacks: true,               // Default: true
    oauthCallbackPrefix: "/callback/",  // Default
  },

  // Restrict signups to specific email domains.
  // When set, only emails matching these domains can use invitation codes.
  // Default: undefined (all domains allowed)
  allowedDomains: ["company.com", "partner.org"],

  // Callback fired after an invitation is consumed by a successful signup.
  // Use for post-signup logic (assign role, send welcome email, add to team).
  onInvitationUsed: async ({ invitation, user }) => {
    const meta = invitation.metadata;
    if (meta?.role) {
      await assignRole(user.id, meta.role);
    }
  },

  // Custom invite store for multi-process/serverless deployments.
  // Default: in-memory Map (single-process only).
  // See "Custom Invite Store" section below.
  inviteStore: new RedisInviteStore(redis),

  // Override default rate limits per endpoint.
  rateLimits: {
    validate: { max: 10, window: 60 },  // Default
    create: { max: 20, window: 60 },     // Default (also applies to create-batch)
    resend: { max: 10, window: 60 },     // Default
  },
})
```

## Runtime Toggle

The `enabled` option accepts a function, so you can flip invite-only mode on and off without redeploying. The kind of feature that sounds trivial until you're the one explaining to your CEO why the public launch is blocked by a deploy queue.

```typescript
inviteOnly({
  enabled: () => process.env.INVITE_ONLY === "true",
})
```

This is evaluated on every request, so changing the env var and restarting the server toggles the mode immediately.

## Domain Whitelist

For when "invite-only" still isn't exclusive enough. Restrict which email domains can use invitation codes:

```typescript
inviteOnly({
  allowedDomains: ["company.com", "partner.org"],
})
```

Wildcard patterns are supported -- `*.example.com` matches `sub.example.com` and `deep.sub.example.com`:

```typescript
inviteOnly({
  allowedDomains: ["company.com", "*.partner.org"],
})
```

When set, the domain check applies to both invitation creation (admin) and signup (user). Emails not matching any allowed domain are rejected with `DOMAIN_NOT_ALLOWED`.

## Multi-Use Codes

Create shareable invite links that can be used multiple times. Perfect for "share this with your team" without generating 47 individual invitations like some kind of medieval scribe.

```typescript
// Server: create a multi-use invitation
const { data } = await authClient.inviteOnly.createInvitation({
  email: "team@company.com",
  maxUses: 10, // 10 people can use this code
});
```

The invitation tracks `useCount` and is fully consumed (`usedAt` set) when `useCount` reaches `maxUses`.

## Custom Metadata

Attach arbitrary data to invitations for post-signup logic. Shove whatever you want in there -- team assignments, roles, a heartfelt welcome message. Vibe Code stores it as JSON and minds its own business.

```typescript
const { data } = await authClient.inviteOnly.createInvitation({
  email: "new@company.com",
  metadata: { team: "engineering", role: "developer", department: "backend" },
});

// Access metadata in the onInvitationUsed callback
inviteOnly({
  onInvitationUsed: async ({ invitation, user }) => {
    const { team, role } = invitation.metadata ?? {};
    // Assign team and role to the new user
  },
})
```

## Post-Signup Callback

The `onInvitationUsed` callback fires after a successful signup that consumed an invitation. This is where you do the interesting stuff -- role assignment, team onboarding, welcome emails, whatever your product manager dreamed up this sprint.

```typescript
inviteOnly({
  onInvitationUsed: async ({ invitation, user }) => {
    // invitation: the full invitation record
    // user: the newly created user { id, email, ... }
    await sendWelcomeEmail(user.email);
    await addToTeam(user.id, invitation.metadata?.teamId);
  },
})
```

The callback is wrapped in a try-catch -- if it throws, the error is logged but the signup is not rolled back. The user still gets in. Your Slack notification about the failed webhook is a problem for future-you.

## Custom Invite Store

By default, pending invite entries are stored in an in-memory Map. This works perfectly for single-process Node.js deployments. For multi-process, cluster, or serverless deployments, provide a custom store implementation.

The `InviteStore` interface:

```typescript
import type { InviteStore, InviteStoreEntry } from "better-auth-invitation-only";

interface InviteStore {
  get(key: string): Promise<InviteStoreEntry | null> | InviteStoreEntry | null;
  set(key: string, value: InviteStoreEntry): Promise<void> | void;
  delete(key: string): Promise<void> | void;
  cleanup(): Promise<void> | void;
}
```

Example Redis implementation:

```typescript
import type { InviteStore, InviteStoreEntry } from "better-auth-invitation-only";

class RedisInviteStore implements InviteStore {
  constructor(private redis: Redis, private ttlMs = 5 * 60 * 1000) {}

  async get(key: string) {
    const raw = await this.redis.get(`invite:${key}`);
    return raw ? JSON.parse(raw) : null;
  }

  async set(key: string, value: InviteStoreEntry) {
    await this.redis.set(`invite:${key}`, JSON.stringify(value), "PX", this.ttlMs);
  }

  async delete(key: string) {
    await this.redis.del(`invite:${key}`);
  }

  async cleanup() {
    // Redis TTL handles expiration automatically
  }
}

// Use it:
inviteOnly({
  inviteStore: new RedisInviteStore(redis),
})
```

All methods can be synchronous or return a Promise -- the plugin awaits either way.
