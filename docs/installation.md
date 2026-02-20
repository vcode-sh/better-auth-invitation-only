# Installation

## Prerequisites

- Node.js >= 22
- Better Auth >= 1.4.18

## Install

```bash
npm install better-auth-invitation-only
# or
pnpm add better-auth-invitation-only
# or
bun add better-auth-invitation-only
```

## Server Setup

Add the plugin to your Better Auth config:

```typescript
import { betterAuth } from "better-auth";
import { inviteOnly } from "better-auth-invitation-only";

export const auth = betterAuth({
  // ... your existing config
  plugins: [
    inviteOnly({
      // All options are optional -- defaults to enabled with 7-day expiry
      sendInviteEmail: async ({ email, inviteUrl }) => {
        // Your email sending logic here
      },
    }),
  ],
});
```

## Client Setup

Add the client plugin:

```typescript
import { createAuthClient } from "better-auth/client";
import { inviteOnlyClient } from "better-auth-invitation-only/client";

export const authClient = createAuthClient({
  plugins: [inviteOnlyClient()],
});
```

## Database Migration

The plugin declares an `invitation` table schema. Run Better Auth's migration:

```bash
npx @better-auth/cli@latest generate
npx @better-auth/cli@latest migrate
```

Or if using Prisma, add the table to your schema manually and run `prisma db push`.
