import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import pino from 'pino';
import type { AppConfig } from './types.js';
import { ConnectorRegistry } from './core/registry.js';
import { registerDbTools } from './tools/register-tools.js';

type ExpressRequest = IncomingMessage & { body?: unknown };
type ExpressResponse = ServerResponse & {
  headersSent: boolean;
  json(body: unknown): void;
  status(code: number): ExpressResponse;
  on(event: 'close', listener: () => void): void;
};

export interface HttpServerOptions {
  host: string;
  port: number;
  path: string;
  allowedHosts?: string[];
  apiKey?: string;
}

export async function startStdioServer(config: AppConfig): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const registry = new ConnectorRegistry(config);
  const server = createServer(config, registry);

  const shutdown = async (): Promise<void> => {
    await server.close();
    await registry.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  logger.info({ connections: registry.list().length }, 'Starting MCP DB Connect server over stdio');
  await server.connect(new StdioServerTransport());
}

export async function startHttpServer(config: AppConfig, options: HttpServerOptions): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const registry = new ConnectorRegistry(config);
  const app = createMcpExpressApp({
    host: options.host,
    allowedHosts: options.allowedHosts,
  });

  app.get('/healthz', (_req: ExpressRequest, res: ExpressResponse) => {
    res.json({
      ok: true,
      name: 'mcp-db-connect',
      transport: 'streamable-http',
      connections: registry.list().length,
      authRequired: Boolean(options.apiKey),
    });
  });

  app.post(options.path, async (req: ExpressRequest, res: ExpressResponse) => {
    if (options.apiKey && !isAuthorized(req, options.apiKey)) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized.',
        },
        id: null,
      });
      return;
    }

    const server = createServer(config, registry);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      logger.error({ error }, 'Failed to handle MCP HTTP request');
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.get(options.path, (_req: ExpressRequest, res: ExpressResponse) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  });

  app.delete(options.path, (_req: ExpressRequest, res: ExpressResponse) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  });

  const httpServer = app.listen(options.port, options.host, () => {
    logger.info(
      {
        host: options.host,
        port: options.port,
        path: options.path,
        connections: registry.list().length,
      },
      'Starting MCP DB Connect server over streamable HTTP',
    );
  });

  const shutdown = async (): Promise<void> => {
    httpServer.close();
    await registry.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
}

function createServer(config: AppConfig, registry: ConnectorRegistry): McpServer {
  const server = new McpServer({
    name: 'mcp-db-connect',
    version: '0.1.7',
  });

  registerDbTools(server, registry, config);
  return server;
}

function isAuthorized(req: ExpressRequest, apiKey: string): boolean {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length) === apiKey;
  }

  const apiKeyHeader = req.headers['x-api-key'];
  if (Array.isArray(apiKeyHeader)) {
    return apiKeyHeader.includes(apiKey);
  }

  return apiKeyHeader === apiKey;
}
