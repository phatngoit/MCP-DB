# Security

The recommended production setup is:

- Use readonly DB users.
- Keep `allowWriteOperations: false`.
- Configure `allowSchemas` and `allowTables` for sensitive environments.
- Keep `blockMultiStatement: true`.
- Set short query timeouts.
- Enable `auditLogPath`.
- Pass secrets through environment variables.

The MCP server blocks common dangerous SQL and MongoDB operations, but DB-level permissions are still required.
