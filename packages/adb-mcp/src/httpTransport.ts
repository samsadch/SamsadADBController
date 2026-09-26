import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { AdbConfig } from '@samsadch/adb-core';
import { createServer } from './server.js';
import type { CliOptions } from './cli.js';

/**
 * Streamable HTTP transport.
 *
 * Exists for clients that cannot spawn a stdio process. Android Studio's Gemini integration
 * is the motivating case: it accepts only an `httpUrl`, so the otherwise-identical stdio
 * server is unreachable from it.
 *
 * Each MCP session gets its own server instance, so the sticky target (device + package)
 * belongs to one client rather than leaking between them.
 */

export const MCP_PATH = '/mcp';
const MAX_BODY_BYTES = 4 * 1024 * 1024;

interface Session {
  transport: StreamableHTTPServerTransport;
  close: () => Promise<void>;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function rpcError(res: ServerResponse, status: number, code: number, message: string): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

/** Hosts accepted in the Host header, to block DNS-rebinding attacks from a browser. */
function buildAllowedHosts(options: CliOptions): string[] {
  const hosts = new Set<string>();
  for (const name of ['127.0.0.1', 'localhost', '[::1]']) {
    hosts.add(`${name}:${options.port}`);
    hosts.add(name);
  }
  hosts.add(`${options.host}:${options.port}`);
  hosts.add(options.host);
  return [...hosts];
}

export function startHttpServer(options: CliOptions, config: AdbConfig): Promise<Server> {
  const sessions = new Map<string, Session>();
  const allowedHosts = buildAllowedHosts(options);

  async function handleInitialize(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown
  ): Promise<void> {
    const { server } = createServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedHosts,
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, {
          transport,
          close: async () => {
            await transport.close();
            await server.close();
          }
        });
      }
    });

    // A closed transport must not leave its session in the map.
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  const httpServer = createHttpServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

        if (url.pathname === '/healthz') {
          sendJson(res, 200, { status: 'ok', transport: 'http', sessions: sessions.size });
          return;
        }

        if (url.pathname !== MCP_PATH) {
          rpcError(res, 404, -32601, `Not found. The MCP endpoint is ${MCP_PATH}.`);
          return;
        }

        const sessionId = req.headers['mcp-session-id'];
        const existing = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;

        if (req.method === 'POST') {
          const body = await readBody(req);
          if (existing) {
            await existing.transport.handleRequest(req, res, body);
            return;
          }
          if (isInitializeRequest(body)) {
            await handleInitialize(req, res, body);
            return;
          }
          rpcError(
            res,
            400,
            -32000,
            sessionId
              ? 'Unknown or expired mcp-session-id. Re-initialize to start a new session.'
              : 'Missing mcp-session-id. Send an initialize request first.'
          );
          return;
        }

        // GET opens the server-to-client SSE stream; DELETE ends the session.
        if (req.method === 'GET' || req.method === 'DELETE') {
          if (!existing) {
            rpcError(res, 400, -32000, 'Missing or unknown mcp-session-id.');
            return;
          }
          await existing.transport.handleRequest(req, res);
          return;
        }

        res.writeHead(405, { Allow: 'GET, POST, DELETE' });
        res.end();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`adb-mcp: request failed: ${message}\n`);
        if (!res.headersSent) {
          rpcError(res, 400, -32700, message);
        } else {
          res.end();
        }
      }
    })();
  });

  httpServer.on('close', () => {
    for (const session of sessions.values()) {
      void session.close();
    }
    sessions.clear();
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host, () => {
      httpServer.removeListener('error', reject);
      resolve(httpServer);
    });
  });
}
