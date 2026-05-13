# Release Process

## Prerequisites

- GitHub repository secret `NPM_TOKEN` with npm publish permission.
- `package.json` version updated.
- `CHANGELOG.md` updated.
- CI passing on `master`.

## Local Validation

```bash
npm run lint
npm run typecheck
npm test
npm pack --dry-run
```

## Publish

Create and push an annotated tag:

```bash
git tag -a v0.1.3 -m "Release v0.1.3"
git push origin v0.1.3
```

Create a GitHub Release from that tag. The release workflow validates the package and publishes it to npm if the package version is not already published.

## Manual Fallback

If the GitHub workflow is unavailable:

```bash
npm publish --access public
```

Verify:

```bash
npm view mcp-db-connect version
npm install -g mcp-db-connect
mcp-db-connect --version
```
