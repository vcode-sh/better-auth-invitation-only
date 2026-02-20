# Changelog

## [0.1.1] - 2026-02-20

### Fixed

- Client plugin now returns `{ data, error }` response shape matching Better Auth conventions
- Added `fetchOptions` parameter to all client API methods
- Changed `validateInviteCode` to accept object param `{ code }` instead of plain string
- Fixed `package.json` exports pointing to non-existent `.mjs` files — now correctly maps to tsup output (`.js`/`.cjs`)
- Fixed `main`/`module` fields (`main` now points to CJS, `module` to ESM)
- Added per-condition `types` fields for correct type resolution in both ESM and CJS

## [0.1.0] - 2026-02-20

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
