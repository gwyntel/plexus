## Project Overview

**Plexus** is a unified API gateway for LLMs. Built on **Bun** + **Fastify**, it exposes OpenAI- and Anthropic-compatible endpoints and routes requests to any backend provider, handling request/response transformation automatically.

**Stack:** Bun, Fastify, Drizzle ORM (SQLite/Postgres), Zod, React frontend (Tailwind v4).

---

## Critical Requirements

- **NEVER** commit or push without explicit request, unless running in CI (`CI=true`). In local/interactive sessions, every individual commit and push requires explicit user permission — even if permission was granted earlier in the same session.
- **NEVER** use `--no-verify` or `LEFTHOOK=0` without user permission.
- **AVOID** searching library type definitions for documentation. Use context/search skills where available first.
- **NEVER** produce implementation or summary documents unless specifically requested.
- **NEVER** edit existing migration files or manually create SQL migrations. See [Migrations](#migrations) below.

---

## Migrations

Use the **`db-schema-migrations`** skill for full guidance on schema changes and migrations.

All migrations **must** be generated using the wrapper script:

```bash
bun run generate-migrations                     # auto-derives name from branch
bun run generate-migrations --name add_foo      # explicit name
```

**Do not** run `drizzle-kit generate` directly. On `main`, `--name` is required (auto-naming unavailable). Random names like `rare_skullbuster` are rejected by CI.

Lint migration files with: `bun run lint:migrations`

---

## Development & Testing

- **Dev server:** `bun run dev` (backend port derived from worktree name + frontend watcher)
- **Dev config (for scripting):**
  ```bash
  PORT=$(bun run dev:get:port)
  DB_PATH=$(bun run dev:get:db_path)
  ```
- **Tests:** `bun run test` from repo root (`bun test` is intentionally blocked)
- **Format:** `bun run format` / `bun run format:check`

### Testing

Use the **`vitest`** skill for full testing guidance. Key project-specific notes:

- Unit tests: `__tests__/` subdirectory alongside the source file
- Integration tests: `test/integration/`
- Run tests: `bun run test` (not `bun test`)
- Use `registerSpy` from `test/test-utils.ts` instead of raw `vi.spyOn`
- Global mocks: `utils/logger` and `@earendil-works/pi-ai` (don't re-mock in test files)
- Reset singletons via `resetForTesting()` methods in `beforeEach`

---

## Pi Assistant (AI Agent Workflow)

The `/pi` trigger in issue/PR comments is handled by `.github/workflows/pi-assistant.yml` (invokes `mcowger/pi-action`).

- **System prompt:** `.github/prompts/pi-assistant.md` — edit this file to change agent instructions; do not put prompt text in the workflow YAML.
- **Placeholders:** `{{context.*}}` (full `@actions/github` context) and `{{env.*}}` (environment variables, including `GITHUB_*` / `RUNNER_*` and any `env:` values on the **Run Pi agent** step). Currently only `INITIAL_COMMENT_ID` is passed explicitly via `env:`.
- **Adding new placeholders:** If it can't be sourced from `context.*`, add it to the `env:` block on the **Run Pi agent** step in `pi-assistant.yml` and reference as `{{env.YOUR_VAR_NAME}}`.

---

## Frontend

- **NEVER** import CSS files with Tailwind directives into `.ts`/`.tsx` files — Bun's CSS loader breaks Tailwind v4 `@theme`/`@source`.
- **Build:** `@tailwindcss/cli` from `packages/frontend`, input `./src/globals.css`, output `./dist/main.css`.
- **Source directive:** `@source "../src/**/*.{tsx,ts,jsx,js}";` in `globals.css`.
- **Assets:** Place in `packages/frontend/src/assets/`, import with ES6 imports. No dynamic paths.
