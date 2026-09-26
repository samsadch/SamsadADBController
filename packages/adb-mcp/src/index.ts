#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configFromEnv, createServer } from './server.js';

/**
 * stdio entry point.
 *
 * stdout carries the JSON-RPC stream, so every diagnostic must go to stderr — a stray
 * console.log here corrupts the protocol and the client drops the connection.
 */
async function main(): Promise<void> {
  const { server } = createServer(configFromEnv());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('adb-mcp: ready on stdio\n');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`adb-mcp: fatal: ${message}\n`);
  process.exit(1);
});
