# Meridian

Meridian is a single-owner intelligent diary that converts natural reflection into trustworthy memory, realistic action, and progressively better personal context.

The Foundation release (WP-01–WP-06) provides local-owner authentication, an
immutable walking journal with processing classes and activity, PostgreSQL
resource/event/outbox storage, and a separate reliable pg-boss worker with
owner-visible health. Microsoft, models, Triage, tasks/reminders, and production
deployment are not yet active.

## Clean-clone setup

Prerequisites: Git and Node.js 24.18.0 (the pinned LTS version).

```sh
git clone https://github.com/G-dubwa/Meridian.git
cd Meridian
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
pnpm run check
docker compose up -d postgres
pnpm db:migrate
pnpm --filter @meridian/web dev
```

Bootstrap the local owner, build/start the worker, and open the journal according
to [local development](docs/ops/local-dev.md). The unauthenticated process probe
remains <http://localhost:3000/health>.

## Governance

Start with the [documentation index](docs/README.md), [authoritative specification](docs/product/spec.md), [project state](docs/product/project-state.md), and [roadmap](docs/product/roadmap.md). Contributors and coding agents must also follow [AGENTS.md](AGENTS.md).

## Governed agent delivery

The standalone INFRA-01 supervisor coordinates isolated Codex implementation
and Claude black-box QA without granting either merge authority:

```sh
pnpm agents:doctor
pnpm agents:plan --wp WP-XX
pnpm agents:run --wp WP-XX
pnpm agents:status
pnpm agents:resume <run-id>
pnpm agents:stop <run-id>
pnpm agents:report <run-id>
pnpm agents:deliver <run-id>
```

See [autonomous orchestration](docs/qa/autonomous-orchestration.md). Automatic
merge and live model-backed piloting are disabled until owner review.
