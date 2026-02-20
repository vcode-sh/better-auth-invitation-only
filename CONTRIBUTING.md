# Contributing

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/vcode-sh/better-auth-invitation-only.git
cd better-auth-invitation-only
npm install
```

## Commands

```bash
npm run dev          # Watch mode build
npm run build        # Production build
npm run type-check   # TypeScript check
npm test             # Run tests
npm run test:watch   # Watch mode tests
npm run test:ui      # Vitest UI
npm run test:coverage # Tests with coverage
npm run lint         # Check formatting
npm run lint:fix     # Fix formatting
```

## Guidelines

1. All code in `src/` directory
2. Tests co-located as `*.test.ts`
3. Run `npm run lint:fix` before committing
4. All tests must pass
5. Maintain type safety (no `any` at public API boundaries)
6. Update CHANGELOG.md for user-facing changes

## Pull Request Process

1. Fork the repo and create a feature branch
2. Write tests for new functionality
3. Ensure `npm test && npm run type-check && npm run lint` pass
4. Update documentation if applicable
5. Submit PR with clear description
