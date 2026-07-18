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
- Git.

Node 24 is selected because production applications should use an LTS line. Next.js 16.2.10 is the current stable release verified on 18 July 2026. TypeScript 6.0.3 is the latest stable version inside `typescript-eslint` 8.64.0's supported `<6.1` peer range; TypeScript 7.0.2 was checked and rejected because it breaks the required lint stack. Re-check official support, peer ranges, and security notices before changing pins.

## First setup

```sh
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
pnpm run check
```

Run the minimal health page with `pnpm --filter @meridian/web dev`, then open <http://localhost:3000/health>. WP-01 requires no environment variables, database, containers, external provider account, or secret.

## Individual checks

Use `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm deps:check`, `pnpm test`, `pnpm docs:check`, and `pnpm build`. `pnpm test:e2e` runs the scaffolded health journey after Playwright's Chromium browser is installed.

The repository engine constraint is intentional. An unsupported local Node version may be useful for diagnosis but does not constitute clean-clone acceptance evidence.
