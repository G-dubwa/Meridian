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
- Homebrew PostgreSQL 18 with pgvector 0.8.x.
- Git.

Node 24 is selected because production applications should use an LTS line. Next.js 16.2.10 is the current stable release verified on 18 July 2026. TypeScript 6.0.3 is the latest stable version inside `typescript-eslint` 8.64.0's supported `<6.1` peer range; TypeScript 7.0.2 was checked and rejected because it breaks the required lint stack. Re-check official support, peer ranges, and security notices before changing pins.

## First setup

```sh
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
pnpm run check
```

Copy `.env.example` to an untracked repository-root `.env`. Start and verify the
existing Homebrew PostgreSQL 18 service, then export the private environment and
migrate the persistent local database:

```sh
brew services start postgresql@18
pg_isready -h 127.0.0.1 -p 5432
set -a; source .env; set +a
pnpm db:migrate
```

The example credentials are development-only. Bootstrap the one local owner
from the same private terminal:

```sh
pnpm auth:bootstrap -- --identifier owner --time-zone Africa/Johannesburg --locale en-ZA
```

Store the ten one-time recovery codes offline; they cannot be displayed again.
Run the web application with `pnpm --filter @meridian/web dev`, then open
<http://localhost:3000/login> or the unauthenticated health page at
<http://localhost:3000/health>. After login, open
<http://localhost:3000/journal>. WP-18 also needs
`MERIDIAN_KNOWLEDGE_OBJECT_ROOT` in the web process environment; the example
uses ignored `.local-data/knowledge`. Original source bytes remain there with
owner-only file modes. If the value is absent, the Knowledge Library fails
closed as unavailable. See the operations runbook before automating bootstrap
or handling lockout/recovery.

Build and start the separate worker after bootstrap:

```sh
pnpm --filter @meridian/worker build
pnpm --filter @meridian/worker start
```

The first start installs pg-boss tables when the development `DATABASE_URL`
owns the disposable local database. Keep it running beside the web process, then
open <http://localhost:3000/settings/health>. Stop with SIGTERM or Ctrl-C; the
worker stops polling and gives in-flight work up to ten seconds to settle.

## Microsoft connection

WP-07 is optional until a live connection is being tested. In a Microsoft Entra
app registration, choose the Web platform, allow personal Microsoft accounts,
and register this redirect URI exactly:

```text
http://localhost:3000/api/integrations/microsoft/callback
```

Because the filtered Next.js command runs from `apps/web`, put its runtime values
in untracked `apps/web/.env.local` (not in `.env.example` itself). Include
`DATABASE_URL` plus these Microsoft names:

```dotenv
DATABASE_URL=postgres://meridian:<local-postgres-password>@127.0.0.1:5432/meridian
MICROSOFT_CLIENT_ID=<application-client-id>
MICROSOFT_CLIENT_SECRET=<web-client-secret>
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/integrations/microsoft/callback
MICROSOFT_TOKEN_ENCRYPTION_KEY=<32-random-bytes-as-base64>
```

Generate the encryption value locally with `openssl rand -base64 32`. Do not
paste either secret into chat, logs, tickets, or source control. Meridian asks
Microsoft only for `openid profile offline_access User.Read Calendars.Read`.
After login, use <http://localhost:3000/settings/integrations> to connect and
disconnect. The automated E2E runner deliberately clears these variables and
never contacts Microsoft.

`pnpm test:integration` uses `TEST_DATABASE_URL` when supplied. Otherwise, on
macOS with Homebrew PostgreSQL 18 and pgvector installed, it creates and destroys
an isolated temporary cluster automatically. It installs pg-boss inside that
cluster and proves concurrent dispatch, retry, and dead letter. It never uses
the persistent Compose database by default.

## Individual checks

Use `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm deps:check`, `pnpm db:check`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e:auth`, `pnpm docs:check`, and `pnpm build`. `pnpm test:e2e` runs the scaffolded health journey after Playwright's Chromium browser is installed. The authentication journey uses Playwright's request client and an isolated PostgreSQL cluster, so it does not require a browser download.

The repository engine constraint is intentional. An unsupported local Node version may be useful for diagnosis but does not constitute clean-clone acceptance evidence.

## GPT-5.6 task-routing evaluation

WP-09 optionally composes the restricted Alpha extraction workflow. Put the one
owner-approved key in an untracked root `.env` or export it in a private
terminal:

```dotenv
OPENAI_API_KEY=<local-openai-project-key>
```

Never put this value in logs, tickets, reports, or source control. The web
runtime reads only the inherited process environment; source the ignored root
environment privately before starting Next.js. Do not copy or print the value.
After owner approval, source the root environment privately and run the exact
command in `docs/ai/bakeoff.md`. The runner always evaluates Luna, Terra, and
Sol, and refuses paid calls without `--confirm-paid-evaluation` and a sufficient
`--max-cost-usd`. No redirect URI is involved.

In the journal entry view, `Propose Triage items` is available only for a
current Standard revision. It displays an explicit transfer confirmation, then
uses Sol/`none`, `store: false`, and strict bounded output. A missing key returns
a sanitized unavailable response and creates nothing. Automated tests never
invoke the provider.
