# Contributing

## Development

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Use local config files such as `mcp-db.local.yml` and keep secrets in `.env`.

## Pull Requests

Pull requests should include:

- Summary of the change
- Test results
- Documentation updates for user-facing behavior
- Security notes when touching query execution, config, or credential handling

## Commit Style

Use Conventional Commits:

```text
feat: add query explain tool
fix: mask nested secret fields
docs: document streamable http setup
```

## Security

Do not commit credentials, production endpoints, audit logs, or local config files.
