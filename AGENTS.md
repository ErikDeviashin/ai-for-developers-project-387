# AGENTS.md

## Project structure

- `server/` — Fastify backend.
- `client/` — React/Vite frontend.
- `contract/` — TypeSpec contract and OpenAPI/SDK generation.
- `README.md` — source of product requirements and booking rules.

## Commands

- `pnpm install --frozen-lockfile` — reproducible install.
- `pnpm dev` — run server and client; `pnpm dev:server` / `pnpm dev:client` run one.
- `pnpm check` — mandatory final verification before finishing.
- `pnpm api:generate` — regenerate OpenAPI and SDK.
- `pnpm build` — generate the API and build both apps.
- Use `pnpm test`, `pnpm lint`, or `pnpm format:check` for focused checks.

## Technical rules

- `contract/main.tsp` is the source of truth for the API.
- Never edit `contract/generated/openapi.yaml` or `client/src/api/generated/**` manually.
- Generated OpenAPI and SDK are intentionally committed to Git.
- Keep the server's testable `buildApp()` factory.
- In server TypeScript files with `NodeNext`, relative imports use the `.js` extension.
- Server tests must use `Fastify.inject()` and must not bind a TCP port.
- Keep TypeScript on version 6: `@hey-api/openapi-ts@0.99.0` is incompatible with TypeScript 7.
- Do not modify `.github/workflows/hexlet-check.yml` or `.github/workflows/README.md`.
- Commit messages follow Conventional Commits.
- Implementation commits must reference the issue they close, for example `feat: add meeting type publishing (#17)`.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
