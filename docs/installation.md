# Installation

Three steps between you and a signup page that actually gatekeeps. Revolutionary, I know.

## Prerequisites

- Node.js >= 22
- Better Auth >= 1.4.18

That's it. No Kubernetes cluster. No "enterprise licence agreement." Just a runtime and an auth library.

## Install

Pick your package manager. I won't judge. (I will, privately.)

```bash
npm install better-auth-invitation-only
# or
pnpm add better-auth-invitation-only
# or
bun add better-auth-invitation-only
```

## Server Setup

Add the plugin to your Better Auth config. If you've ever added a plugin before, you already know the drill. If you haven't, welcome to the shape of every Better Auth setup you'll do for the rest of your career:

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

Same ritual, client side. One import, one function call, zero existential dread.

```typescript
import { createAuthClient } from "better-auth/client";
import { inviteOnlyClient } from "better-auth-invitation-only/client";

export const authClient = createAuthClient({
  plugins: [inviteOnlyClient()],
});
```

## Database Migration

The plugin declares an `invitation` table schema. You still have to run the migration yourself, because I respect your autonomy. Or because I can't access your database. One of those.

```bash
npx @better-auth/cli@latest generate
npx @better-auth/cli@latest migrate
```

Or if using Prisma, add the table to your schema manually and run `prisma db push`.
