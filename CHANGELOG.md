# Changelog

All notable changes to this project will be documented here. I keep it honest -- no "minor improvements" hand-waving.

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
