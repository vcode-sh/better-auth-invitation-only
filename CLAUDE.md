# better-auth-invitation-only

Invite-only registration plugin for [Better Auth](https://www.better-auth.com/). Gates signups with admin-managed invitation codes, supports email + OAuth flows, full CRUD admin endpoints.

## Architecture

```
src/
  index.ts              Server plugin entry — schema, hooks, endpoint wiring, init()
  client.ts             Client plugin — typed actions (createInvitation, validate, etc.), cookie helpers
  types.ts              All TypeScript interfaces and types (no runtime code)
  constants.ts          Defaults, error codes, magic numbers
  admin-endpoints.ts    Admin endpoints: create, create-batch, list, stats
  admin-mutations.ts    Admin mutations: revoke, resend, delete
  admin-queries.ts      Admin query endpoints
  admin-helpers.ts      Shared admin helpers: resolveIsAdmin, makeCode, getBaseUrl
  public-endpoints.ts   Public endpoints: validate, config
  hooks.ts              Before/after hooks — invite gate on signup, code consumption
  invite-store.ts       MemoryInviteStore (default, not multi-process safe)
  adapter-helpers.ts    DB adapter utilities
  crypto.ts             Hashing (SHA-256), code generation
  utils.ts              Pure functions — status computation, cookie parsing, URL building
  *.test.ts             Co-located test files
```

Two entry points via tsup: `src/index.ts` (server plugin) and `src/client.ts` (client plugin). Dual ESM/CJS output to `dist/`.

## Code Style

- **Formatter/Linter**: Biome v2 via [Ultracite](https://github.com/haydenbleasel/ultracite) (`npx ultracite check` / `npx ultracite fix`)
- **Config**: `biome.jsonc` extends `ultracite/core`, relaxes naming conventions and `noExplicitAny`
- **TypeScript**: strict mode, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, ES2022 target, bundler module resolution
- **File size**: under 250 LOC (hard limit 280)
- **Zod**: uses Zod 4.x (via better-auth 1.5) — use `z.string().email()`, not `z.email()`
- **Error codes**: use `defineErrorCodes()` from `@better-auth/core/utils/error-codes` — produces `{ code, message }` objects, not plain strings
- **APIError**: use `APIError.from("STATUS", ERROR_CODES.X)` — not `new APIError("STATUS", { message })`
- **lint-staged**: runs `npx ultracite fix` on commit for `*.{ts,tsx,js,jsx,json,jsonc,css}`

## Testing

- **Framework**: Vitest 4.x with happy-dom environment
- **Location**: co-located `*.test.ts` files in `src/`
- **Coverage**: v8 provider, thresholds at 90% lines/branches/statements, 80% functions
- **Patterns**:
  - Pure functions: direct unit tests
  - Client plugin: mock `$fetch`, test actions and cookie manipulation
  - Server plugin: mock `ctx.context.adapter` and `ctx.context.session`
  - Hooks: test handler functions directly
  - Security: adversarial inputs, timing, concurrency
- **Globals**: enabled (`describe`, `it`, `expect` available without import, though tests do import them)

## Commands

```bash
npm run build          # tsup — dual ESM/CJS + .d.ts
npm run dev            # tsup --watch
npm run type-check     # tsc --noEmit
npm test               # vitest run
npm run test:watch     # vitest
npm run test:coverage  # vitest run --coverage
npm run lint           # npx ultracite check
npm run lint:fix       # npx ultracite fix
```

## Dependencies

**Peer**: `better-auth >= 1.5.0`

**Dev only** (nothing at runtime):
- `@biomejs/biome`, `ultracite` — linting
- `vitest`, `@vitest/coverage-v8`, `@vitest/ui`, `happy-dom` — testing
- `better-sqlite3`, `mongodb`, `mongodb-memory-server` — test DB backends
- `tsup`, `typescript` — build
- `lint-staged` — pre-commit

## Review Guidelines

- **Security first**: invite codes are SHA-256 hashed before storage. Never store or log plaintext codes. Never return PII in public endpoints.
- **Adapter-only DB access**: use `ctx.context.adapter` methods (`findOne`, `findMany`, `create`, `update`, `count`, `delete`). Never import Prisma/Drizzle directly.
- **Input validation**: all string inputs bounded with `z.string().min(1).max(256)`. Cursor dates validated with `z.string().datetime()`.
- **Cookie security**: `Secure` on HTTPS, `SameSite=Lax`, 5-min TTL, always `decodeURIComponent` after extraction.
- **OAuth collision prevention**: pending invite keys use `__code:{specificCode}` format, not email-based.
- **Push filtering to DB**: use `where` clauses and `adapter.count()` for aggregations, not post-fetch JS filtering.
- **Coverage enforcement**: 90% lines/branches/statements, 80% functions. Tests must pass before merge.
- **No Claude/Anthropic mentions** in code, GitHub, or docs outside this file.
