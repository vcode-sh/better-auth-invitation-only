# Changelog

All notable changes to this project will be documented here. I keep it honest -- no "minor improvements" hand-waving.

## [1.0.0] - 2026-03-01

The "we're calling it stable because it actually is" release. Upgraded to Better Auth 1.5 and earned the right to drop the zero.

### Breaking

- **Peer dependency**: requires `better-auth >= 1.5.0` (was `>= 1.4.18`)
- **Error codes are now objects**: `ERROR_CODES.INVITE_REQUIRED` is `{ code: "INVITE_REQUIRED", message: "Invitation code required" }` instead of a plain string. If you were importing `ERROR_CODES` for custom error handling, access `.message` or `.code` on them now. This aligns with Better Auth 1.5's `defineErrorCodes()` convention.

### Changed

- Migrated all error handling from `new APIError("STATUS", { message })` to `APIError.from("STATUS", errorCode)` -- Better Auth 1.5's new pattern
- Error codes now use `defineErrorCodes()` from `@better-auth/core/utils/error-codes`
- Plugin registers itself in `BetterAuthPluginRegistry` for proper type inference in 1.5
- MongoDB integration tests use `auth.$context` adapter access (replaces removed `getAdapter`)
- Added `@better-auth/core` to build externals

### Added

- `TOO_MANY_PENDING` error code -- surfaced when the pending invites store is full
- `EMAIL_SEND_FAILED` error code -- returned when the resend email callback throws

## [0.3.0] - 2026-02-20

The "runs everywhere, trusts nothing" release. Took every low-confidence gap -- edge runtimes, MongoDB, community adapters, OAuth in serverless -- and beat them into submission with 88 new tests and zero assumptions about your stack.

### Added

- **Web Crypto API fallback** -- SHA-256 hashing and code generation now work on Cloudflare Workers, Vercel Edge, and Deno. Node `crypto` used when available, `crypto.subtle` when it isn't. Your invite codes don't care where they run.
- **Pluggable `InviteStore` interface** -- swap the in-memory pending invites Map for Redis, KV, Durable Objects, whatever. `get`, `set`, `delete`, `cleanup`. That's the whole contract.
- **`MemoryInviteStore`** -- default implementation, same behaviour as before, now behind a proper interface
- **`safeCount()` adapter helper** -- graceful fallback when adapters don't implement `count()`. Falls back to `findMany` + `.length` with a one-time performance warning. Handles adapters returning `{ count: N }` objects too.
- **Wildcard domain whitelist** -- `*.example.com` now matches `foo.example.com`. Because someone was going to ask.
- **`toDate()` utility** -- defensive Date parsing that handles Date objects, ISO strings, and timestamps. Adapters return whatever they feel like; this normalizes it.
- **`hasNodeCrypto()` runtime detection** -- feature-checks `node:crypto` before importing it
- **Production warning** -- logs a warning at init if you're using the default in-memory store. Because you will deploy to serverless and forget.
- **MongoDB integration tests** -- 12 tests via `mongodb-memory-server`. Full adapter coverage: findOne, findMany, count, update, create, delete, cursor pagination, metadata JSON, date round-trips.
- **SQLite integration tests** -- 21 tests using `getTestInstance()` from better-auth. Full plugin lifecycle, real signup flow, endpoint testing, pagination, metadata round-trips.
- **Crypto unit tests** -- 15 tests covering Web Crypto paths, Node crypto paths, and fallback behaviour
- **Adapter helper tests** -- 11 tests for `safeCount` with every adapter quirk imaginable
- **Bun CI job** -- full test suite verified on Bun 1.3.9, added to GitHub Actions matrix
- **Compatibility docs** -- README now has framework, database, runtime, and deployment compatibility tables
- **Known Limitations docs** -- honest about what doesn't work (cursor pagination ties, Safari ITP, single-process in-memory store)
- **InviteStore docs** -- `configuration.md` now has the interface spec and a Redis example

### Changed

- Extracted `admin-queries.ts` from `admin-endpoints.ts` (was 417 LOC, now 265 + 150). Files have a 250 LOC limit and I enforce it.
- Extracted `crypto.ts` for all hashing/random generation with runtime detection
- Extracted `invite-store.ts` for the pluggable store interface and default implementation
- Extracted `after-hooks.ts` for post-signup hook logic
- `setInterval` cleanup now handles missing `unref()` gracefully (edge runtimes don't have it)
- Email domain extraction trims whitespace and handles multiple `@` signs correctly
- README updated with compatibility section, known limitations, and deployment guidance

### Fixed

- Email domain comparison now trims before matching (trailing whitespace no longer bypasses domain whitelist)

## [0.2.1] - 2026-02-20

The "make it look like a proper open source project" patch. No code changes -- just the stuff that makes contributors feel welcome and GitHub look professional.

### Added

- `SECURITY.md` -- vulnerability reporting policy (email, not public issues)
- `CODE_OF_CONDUCT.md` -- Contributor Covenant 2.1 with personality
- `.github/CODEOWNERS` -- auto-assigns `@vcode-sh` as reviewer
- `.github/dependabot.yml` -- weekly dep updates, grouped by ecosystem
- `.github/ISSUE_TEMPLATE/bug_report.yml` -- YAML form with version, runtime, DB adapter fields
- `.github/ISSUE_TEMPLATE/feature_request.yml` -- YAML form with problem/solution structure
- `.github/ISSUE_TEMPLATE/config.yml` -- disables blank issues, links to docs + discussions
- `.github/workflows/release.yml` -- tag-triggered npm publish with `--provenance` and GitHub Release
- `.nvmrc` -- pins Node 22 for contributors

### Changed

- All documentation rewritten
- CI: added npm caching, concurrency groups, upgraded codecov to v5 with token
- CI: fixed artifact verification (was checking non-existent `.mjs` files)
- CI: removed redundant `npm test` step (only runs coverage now)
- CI: removed redundant type-check from lint job
- PR validation: added concurrency groups, fixed bundle size glob
- `CONTRIBUTING.md` -- full rewrite with project structure, testing patterns, clear rules
- `CHANGELOG.md` -- added version intro one-liners
- PR template -- added testing section, related issues, coverage checklist
- `.gitignore` -- cleaned up and organized by category
- `.npmignore` -- added governance files to exclude from npm package

### Fixed

- CI workflow checking for `dist/index.mjs` instead of `dist/index.js` (would always fail)
- PR validation bundle size reporting referencing non-existent `.mjs` files

## [0.2.0] - 2026-02-20

The one where I actually built all the things people asked for instead of closing issues with "won't fix."

### Added

- **Multi-use codes** -- `maxUses` parameter (1-10,000) with `useCount` tracking
- **Batch invitations** -- `POST /invite-only/create-batch` for up to 50 invitations per call
- **Hard delete** -- `POST /invite-only/delete` for GDPR compliance (permanent removal)
- **Custom metadata** -- attach arbitrary JSON to invitations (`metadata` field)
- **Domain whitelist** -- `allowedDomains` option to restrict signups to specific email domains
- **Post-signup callback** -- `onInvitationUsed({ invitation, user })` fires after signup
- **Configurable rate limits** -- override defaults per endpoint via `rateLimits` option
- **Query param fallback** -- invite code accepted as `?inviteCode=CODE` query param on signup
- Client actions: `createBatchInvitations`, `deleteInvitation`
- New utility functions: `isDomainAllowed`, `getEmailDomain`
- Comprehensive security test suite (fuzzing, timing, memory safety)
- GitHub Actions: release workflow with npm provenance, dependabot, CodeQL-ready CI
- Issue templates (YAML forms), `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`

### Changed

- Schema: added `maxUses`, `useCount`, `metadata` fields to `invitation` table
- `createInvitation` now accepts `maxUses` and `metadata` parameters
- Rate limit for `/create-batch` shares the `create` rate limit config
- CI: fixed artifact verification (was checking non-existent `.mjs` files)
- CI: added npm caching, concurrency groups, codecov v5 with token
- Updated all documentation for v0.2.0 features

### Fixed

- CI workflow checking for `dist/index.mjs` instead of `dist/index.js` (would always fail)
- PR validation bundle size reporting referencing non-existent `.mjs` files
- Zod 4.x compatibility: `z.record(z.any())` changed to `z.record(z.string(), z.any())`
- Biome 2.x config: schema version, extends path, rule names, override syntax

## [0.1.1] - 2026-02-20

The "shipped it and immediately realized the exports were wrong" patch. A tradition as old as npm itself.

### Fixed

- Client plugin now returns `{ data, error }` response shape matching Better Auth conventions
- Added `fetchOptions` parameter to all client API methods
- Changed `validateInviteCode` to accept object param `{ code }` instead of plain string
- Fixed `package.json` exports pointing to non-existent `.mjs` files -- now correctly maps to tsup output (`.js`/`.cjs`)
- Fixed `main`/`module` fields (`main` now points to CJS, `module` to ESM)
- Added per-condition `types` fields for correct type resolution in both ESM and CJS

## [0.1.0] - 2026-02-20

The beginning. Every repo has to start somewhere. Most start with a broken build. I started with a working one. Barely.

### Added

- Initial release
- Server plugin with invite-gated signup (email + OAuth)
- Admin CRUD endpoints: create, list, revoke, resend, stats
- Public endpoints: validate code, get config
- Client plugin with typed methods and cookie helpers
- Cursor-paginated invitation listing with status filter
- Configurable code generation, expiry, email callback
- Runtime enable/disable toggle
- Built-in rate limiting on sensitive endpoints
- Comprehensive test suite
