# Contributing

Thanks for your interest in improving this project.

## Setup

```bash
cp .env.example .env.development
# Edit src/config/features.ts — enable only domains you have keys for
npm ci
npx prisma migrate dev
npm run dev
```

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) and [docs/API_KEYS.md](docs/API_KEYS.md).

## Guidelines

- Keep changes focused; match existing TypeScript / Express / Prisma style.
- Do not commit `.env*`, keys, or PEM material (only `.env.example` is tracked).
- Partner integrations are optional — toggle `FEATURES` in `src/config/features.ts`.
- Prefer English for code comments and commit messages.

## Pull requests

1. Describe the problem and solution briefly.
2. Note how you tested (e.g. `npm run build`, hit `/health`).
3. Avoid bundling unrelated refactors.

## License

By contributing, you agree your contributions are licensed under the MIT License (see [LICENSE](LICENSE)).
