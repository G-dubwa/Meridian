---
purpose: Define the verified local environment and development commands.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Local development

## Supported environment

- Node.js 24.18.0 LTS, pinned by `.node-version` and `.nvmrc`.
- pnpm 11.14.0, pinned by `package.json#packageManager`.
- Docker Compose with PostgreSQL 18 and pgvector 0.8.5, or local PostgreSQL 18 plus pgvector 0.8.x for integration tests.
- Git.

Node 24 is selected because production applications should use an LTS line. Next.js 16.2.10 is the current stable release verified on 18 July 2026. TypeScript 6.0.3 is the latest stable version inside `typescript-eslint` 8.64.0's supported `<6.1` peer range; TypeScript 7.0.2 was checked and rejected because it breaks the required lint stack. Re-check official support, peer ranges, and security notices before changing pins.

## First setup

```sh
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
pnpm run check
```

Copy `.env.example` to an untracked `.env`, then run `docker compose up -d postgres` and `pnpm db:migrate` for a persistent local database. The example credentials are development-only. Bootstrap the one local owner from a private terminal:

```sh
pnpm auth:bootstrap -- --identifier owner --time-zone Africa/Johannesburg --locale en-ZA
```

Store the ten one-time recovery codes offline; they cannot be displayed again.
Run the web application with `pnpm --filter @meridian/web dev`, then open
<http://localhost:3000/login> or the unauthenticated health page at
<http://localhost:3000/health>. After login, open
<http://localhost:3000/journal>. See the operations runbook before automating
bootstrap or handling lockout/recovery.

Build and start the separate worker after bootstrap:

```sh
pnpm --filter @meridian/worker build
pnpm --filter @meridian/worker start
```

The first start installs pg-boss tables when the development `DATABASE_URL`
owns the disposable local database. Keep it running beside the web process, then
open <http://localhost:3000/settings/health>. Stop with SIGTERM or Ctrl-C; the
worker stops polling and gives in-flight work up to ten seconds to settle.

`pnpm test:integration` uses `TEST_DATABASE_URL` when supplied. Otherwise, on
macOS with Homebrew PostgreSQL 18 and pgvector installed, it creates and destroys
an isolated temporary cluster automatically. It installs pg-boss inside that
cluster and proves concurrent dispatch, retry, and dead letter. It never uses
the persistent Compose database by default.

## Individual checks

Use `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm deps:check`, `pnpm db:check`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e:auth`, `pnpm docs:check`, and `pnpm build`. `pnpm test:e2e` runs the scaffolded health journey after Playwright's Chromium browser is installed. The authentication journey uses Playwright's request client and an isolated PostgreSQL cluster, so it does not require a browser download.

The repository engine constraint is intentional. An unsupported local Node version may be useful for diagnosis but does not constitute clean-clone acceptance evidence.
