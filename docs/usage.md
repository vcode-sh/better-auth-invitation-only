# Usage

## Email/Password Signup

Pass `inviteCode` as an extra field in the signup body:

```typescript
const result = await authClient.signUp.email({
  email: "user@example.com",
  password: "secret123",
  name: "Jane Doe",
  inviteCode: "abc123def456...",
});
```

The plugin's before-hook intercepts `/sign-up/email`, validates the code, and allows or blocks the signup.

The invite code can also be passed as a query parameter (`?inviteCode=CODE`) for frameworks that prefer query params over body fields.

## OAuth Signup (Google, GitHub, etc.)

OAuth redirects lose the invite code from the URL. Store it in a cookie first:

```typescript
// 1. Set cookie before redirect
authClient.inviteOnly.setInviteCodeCookie("abc123def456...");

// 2. Initiate OAuth
await authClient.signIn.social({
  provider: "google",
  callbackURL: "/dashboard",
});
```

The plugin reads the cookie from the OAuth callback request and validates it.

## Registration Page (Next.js Example)

```tsx
// app/register/page.tsx (Server Component)
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  return <RegisterForm inviteCode={invite} />;
}

// components/RegisterForm.tsx (Client Component)
"use client";

import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";

export function RegisterForm({ inviteCode }: { inviteCode?: string }) {
  const [code, setCode] = useState(inviteCode ?? "");
  const [inviteOnly, setInviteOnly] = useState(false);

  useEffect(() => {
    authClient.inviteOnly.getInviteConfig().then(({ data }) => {
      if (data) setInviteOnly(data.enabled);
    });
  }, []);

  const handleSubmit = async (formData: FormData) => {
    await authClient.signUp.email({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      name: formData.get("name") as string,
      inviteCode: code || undefined,
    });
  };

  const handleGoogleSignIn = () => {
    if (code) authClient.inviteOnly.setInviteCodeCookie(code);
    authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" });
  };

  if (inviteOnly && !code) {
    return (
      <div>
        <h2>Invitation Required</h2>
        <input
          placeholder="Enter your invite code"
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(new FormData(e.currentTarget));
      }}
    >
      <input name="name" placeholder="Name" required />
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Register</button>
      <button type="button" onClick={handleGoogleSignIn}>
        Sign up with Google
      </button>
    </form>
  );
}
```

## Admin Dashboard

```typescript
// Create single invitation
const { data } = await authClient.inviteOnly.createInvitation({
  email: "newuser@example.com",
  sendEmail: true,
  maxUses: 1,
  metadata: { team: "engineering" },
});

// Create batch invitations
const { data: batch } = await authClient.inviteOnly.createBatchInvitations({
  invitations: [
    { email: "alice@company.com", sendEmail: true },
    { email: "bob@company.com", sendEmail: true, maxUses: 5 },
    { email: "carol@company.com", metadata: { dept: "sales" } },
  ],
});
console.log(`Created ${batch.count} invitations`);

// List with pagination
const { data: page1 } = await authClient.inviteOnly.listInvitations({
  status: "pending",
  limit: 20,
});

// Load next page
const { data: page2 } = await authClient.inviteOnly.listInvitations({
  status: "pending",
  limit: 20,
  cursor: page1.nextCursor,
});

// Revoke (soft delete)
await authClient.inviteOnly.revokeInvitation({ id: invitation.id });

// Delete (hard delete, for GDPR)
await authClient.inviteOnly.deleteInvitation({ id: invitation.id });

// Resend email (revokes old, creates new code)
await authClient.inviteOnly.resendInvitation({ id: invitation.id });

// Stats
const { data: stats } = await authClient.inviteOnly.getInvitationStats();
console.log(`${stats.pending} pending, ${stats.used} used`);
```

## Validate Code (Public)

```typescript
const { data } = await authClient.inviteOnly.validateInviteCode({ code: "abc123" });
if (data.valid) {
  console.log(`Code valid until ${data.expiresAt}`);
}
```

Note: The validate endpoint does not return email or any PII for security reasons.
