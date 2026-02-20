# Contributing

You want to contribute to an invite-only Better-Auth plugin. The irony is not lost on me. Come on in.

## Development Setup

```bash
git clone https://github.com/vcode-sh/better-auth-invitation-only.git
cd better-auth-invitation-only
npm install
```

### Prerequisites

- Node.js >= 22 (see `.nvmrc` -- yes, I pinned it, I'm not an animal)
- npm >= 10

## Commands

These are the incantations. Learn them. Love them. Run them before pushing.

```bash
npm run dev          # Watch mode build -- for the impatient
npm run build        # Production build (ESM + CJS + DTS) -- the real thing
npm run type-check   # TypeScript strict check -- the compiler judges you so I don't have to
npm test             # Run all tests -- you'd be surprised how many people skip this
npm run test:watch   # Watch mode -- for when you're in the zone
npm run test:ui      # Vitest UI -- pretty graphs that prove you did something
npm run test:coverage # Coverage report -- the number must go up
npm run lint         # Biome lint check -- it has opinions and they are correct
npm run lint:fix     # Auto-fix -- let the machine do the boring part
```

## Project Structure

```
src/
  index.ts             Server plugin entry (schema, hooks, endpoints)
  admin-endpoints.ts   Admin: create, create-batch, list, stats, delete
  admin-mutations.ts   Admin: revoke, resend
  admin-helpers.ts     Shared admin helpers
  public-endpoints.ts  Public: validate, config
  hooks.ts             Before/after hooks (invite gate, consumption)
  client.ts            Client plugin (typed actions, cookie helpers)
  types.ts             TypeScript interfaces
  utils.ts             Pure functions (hashing, status, cookies)
  constants.ts         Defaults and error codes
  *.test.ts            Co-located tests
```

## The Rules

Not guidelines. Not suggestions. Rules.

1. **Files under 250 LOC** -- if your file is getting long, your abstraction is getting wrong
2. **Tests live next to their code** as `*.test.ts` -- no hunting through a distant `__tests__` folder like it's 2017
3. **Run `npm run lint:fix`** before committing -- Biome catches things your eyes won't
4. **All tests must pass** with `npm test` -- a failing test suite is not a "known issue," it's a blocker
5. **Type safety everywhere** -- no `any` at public API boundaries, this isn't JavaScript
6. **Security first, features second** -- hash codes, validate inputs, no PII in public endpoints
7. **Use the Better Auth adapter** -- `ctx.context.adapter` for all DB access, importing an ORM directly is a paddling
8. **Update CHANGELOG.md** for user-facing changes -- the changelog is a love letter to your future maintainers

## Testing

I maintain 90%+ coverage. Not because I worship the metric, but because untested code is just a theory.

- **Utilities**: direct unit tests in `utils.test.ts`
- **Endpoints**: mock `ctx.context.adapter`, test in `admin-endpoints.test.ts` or `public-endpoints.test.ts`
- **Hooks**: mock middleware, test handler functions in `hooks.test.ts`
- **Client**: mock `$fetch`, test in `client.test.ts`
- **Security**: adversarial inputs, timing, concurrency in `security.test.ts`

## Pull Request Process

1. Fork the repo and branch off `main` (not `develop`, not `feature-branch-from-six-months-ago`)
2. Write tests for your new code (yes, before the PR, not "I'll add them later")
3. Make sure absolutely everything passes:
   ```bash
   npm run type-check && npm test && npm run lint
   ```
4. Update documentation if applicable (it is applicable more often than you think)
5. Update `CHANGELOG.md` under an `[Unreleased]` section
6. Open a PR with a clear description -- "misc fixes" tells me nothing

## Reporting Issues

- **Bugs**: use the [bug report template](https://github.com/vcode-sh/better-auth-invitation-only/issues/new?template=bug_report.yml)
- **Features**: use the [feature request template](https://github.com/vcode-sh/better-auth-invitation-only/issues/new?template=feature_request.yml)
- **Security**: see [SECURITY.md](SECURITY.md) -- do NOT open a public issue for vulnerabilities unless you enjoy chaos

## Code of Conduct

There is one. It's in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). The short version: don't be awful. The long version: read the file.
