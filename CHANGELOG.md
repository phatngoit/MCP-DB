# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## 0.1.7

- Allowed the interactive setup wizard to add multiple connections for the same database type in one run.
- Bumped the package version after `0.1.6` was already published to npm.

## 0.1.6

- Added `mcp-db-connect setup`, an interactive wizard for selecting AI clients and database types.
- Added project-local AI config generation for Claude Code, Codex CLI, Gemini CLI, Kimi CLI, and generic MCP JSON.
- Clarified per-connection DB port prompts and documentation.
- Expanded README setup instructions with per-client examples.

## 0.1.5

- Formatted query, MongoDB find, and MongoDB aggregate results as Markdown tables for easier AI reading.

## 0.1.4

- Added automatic `.gitignore` updates during `init` for `.env`, `mcp-db.local.yml`, and `logs/`.

## 0.1.3

- Added project-local config and `.env` auto-discovery for simpler AI client setup.
- Changed `init` to create `mcp-db.local.yml` and `.env.example` by default.

## 0.1.2

- Fixed npm package metadata for the CLI binary entry before initial npm publish.

## 0.1.1

- Added optional API key protection for Streamable HTTP MCP requests.
- Expanded AI client setup, HTTP auth, and integration testing documentation.

## 0.1.0

- Initial MCP server for Oracle, Microsoft SQL Server, and MongoDB.
- Added stdio and Streamable HTTP transports.
- Added readonly-first query tools, schema inspection, MongoDB find and aggregate tools.
- Added SQL execution plan support for Oracle and Microsoft SQL Server.
- Added config validation, connection testing, audit logging, field masking, row limits, and query guards.
