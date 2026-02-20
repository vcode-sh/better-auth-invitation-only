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

  // Cookie TTL in seconds.
  // Default: 300 (5 minutes)
  cookieMaxAge: 300,

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
