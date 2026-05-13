# Security Policy

## Supported Versions

Security fixes are provided for the latest released version.

## Reporting a Vulnerability

Please do not open a public issue for a vulnerability.

Report privately through GitHub Security Advisories if the repository is hosted on GitHub, or contact the repository owner directly.

Include:

- Affected version or commit
- Database type involved
- Reproduction steps
- Impact assessment
- Suggested fix, if known

## Operational Guidance

- Use readonly database users by default.
- Keep `allowWriteOperations: false` unless a deployment explicitly needs writes.
- Store secrets in environment variables or a secret manager.
- Enable audit logging for shared environments.
- Use schema and table allowlists for production databases.
