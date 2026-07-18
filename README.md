# Meridian

Meridian is a single-owner intelligent diary that converts natural reflection into trustworthy memory, realistic action, and progressively better personal context.

WP-01 provides the quality and documentation foundation only. It intentionally contains no database, authentication, product API, model integration, Microsoft integration, or functional product UI beyond a health page.

## Clean-clone setup

Prerequisites: Git and Node.js 24.18.0 (the pinned LTS version).

```sh
git clone https://github.com/G-dubwa/Meridian.git
cd Meridian
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
pnpm run check
pnpm --filter @meridian/web dev
```

Open <http://localhost:3000/health>. Local environment details and troubleshooting are in [local development](docs/ops/local-dev.md).

## Governance

Start with the [documentation index](docs/README.md), [authoritative specification](docs/product/spec.md), [project state](docs/product/project-state.md), and [roadmap](docs/product/roadmap.md). Contributors and coding agents must also follow [AGENTS.md](AGENTS.md).
