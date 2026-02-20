# Configuration

All options are optional. The plugin works with sensible defaults.

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

  // Override default rate limits per endpoint.
  rateLimits: {
    validate: { max: 10, window: 60 },  // Default
    create: { max: 20, window: 60 },     // Default (also applies to create-batch)
    resend: { max: 10, window: 60 },     // Default
  },
})
```

## Runtime Toggle

The `enabled` option can be a function:

```typescript
inviteOnly({
  enabled: () => process.env.INVITE_ONLY === "true",
})
```

This is evaluated on every request, so changing the env var and restarting the server toggles the mode immediately.

## Domain Whitelist

Restrict which email domains can use invitation codes:

```typescript
inviteOnly({
  allowedDomains: ["company.com", "partner.org"],
})
```

When set, the domain check applies to both invitation creation (admin) and signup (user). Emails not matching any allowed domain are rejected with `DOMAIN_NOT_ALLOWED`.

## Multi-Use Codes

Create shareable invite links that can be used multiple times:

```typescript
// Server: create a multi-use invitation
const { data } = await authClient.inviteOnly.createInvitation({
  email: "team@company.com",
  maxUses: 10, // 10 people can use this code
});
```

The invitation tracks `useCount` and is fully consumed (`usedAt` set) when `useCount` reaches `maxUses`.

## Custom Metadata

Attach arbitrary data to invitations for post-signup logic:

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

The `onInvitationUsed` callback fires after a successful signup that consumed an invitation:

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

The callback is wrapped in a try-catch -- if it throws, the error is logged but the signup is not rolled back.
