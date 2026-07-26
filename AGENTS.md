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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **MCP-DB** (537 symbols, 1199 relationships, 44 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "master"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/MCP-DB/context` | Codebase overview, check index freshness |
| `gitnexus://repo/MCP-DB/clusters` | All functional areas |
| `gitnexus://repo/MCP-DB/processes` | All execution flows |
| `gitnexus://repo/MCP-DB/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
