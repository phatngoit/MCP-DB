# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript Node.js MCP server for readonly-first database access. Source files live in `src/`: `cli.ts` is the command entry point, `server.ts` starts the MCP server, `config/` validates YAML configuration, `connectors/` contains Oracle, MSSQL, and MongoDB adapters, `core/` holds shared security/audit logic, and `tools/` registers MCP tools. Tests are colocated as `*.test.ts`, for example `src/core/security.test.ts`. Documentation is in `docs/`, sample configs are in `examples/`, and compiled output goes to `dist/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies; Node.js `>=20.10` is required.
- `npm run dev -- start --config ./mcp-db.local.yml`: run the CLI from TypeScript via `tsx`.
- `npm run build`: compile TypeScript using `tsconfig.build.json` into `dist/`.
- `npm run start -- --config ./mcp-db.local.yml`: run the compiled CLI entry point.
- `npm run typecheck`: run strict TypeScript checks without emitting files.
- `npm run test`: run Vitest tests once.
- `npm run format`: format TypeScript, Markdown, JSON, YAML, and YML files with Prettier.
- `npm run lint`: run ESLint over `src/**/*.ts`; ensure an ESLint config exists before relying on CI.

## Coding Style & Naming Conventions

Use ES modules and strict TypeScript. Follow Prettier settings: single quotes, semicolons, trailing commas, and a 100-character print width. Use kebab-case filenames such as `load-config.ts` and `register-tools.ts`. Prefer named exports for shared utilities and explicit types at connector and MCP tool boundaries.

## Testing Guidelines

Vitest is the test framework. Add focused `*.test.ts` files next to the code they cover. Use descriptive `describe` blocks and `it` cases such as `it('blocks SQL writes', ...)`. Run `npm run typecheck` and `npm run test` before submitting changes. Security-sensitive code, config validation, and connectors should test both allowed and blocked paths.

## Commit & Pull Request Guidelines

This repository has no existing commit history, so use Conventional Commits going forward, for example `feat: add postgres connector` or `fix: mask nested token fields`. Pull requests should include a summary, test results, linked issues when applicable, and config or documentation updates for behavior changes. Include screenshots only when visuals clarify docs or client setup.

## Security & Configuration Tips

Do not commit real database credentials. Keep secrets in environment variables referenced by `passwordEnv` or `uriEnv`, and use local config files such as `mcp-db.local.yml` for development. Preserve readonly defaults, query limits, masking, and audit logging unless a change explicitly requires otherwise.
