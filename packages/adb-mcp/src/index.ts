#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CliError, HELP_TEXT, isLoopback, parseArgs } from './cli.js';
import { startHttpServer, MCP_PATH } from './httpTransport.js';
import { configFromEnv, createServer } from './server.js';

/**
 * Entry point.
 *
 * On stdio, stdout carries the JSON-RPC stream, so every diagnostic must go to stderr — a
 * stray console.log there corrupts the protocol and the client drops the connection. The
 * same rule is kept in HTTP mode for consistency.
 */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.env);

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const config = configFromEnv();

  if (options.transport === 'http') {
    await startHttpServer(options, config);
    const shown = options.host === '::1' ? `[${options.host}]` : options.host;
    process.stderr.write(`adb-mcp: ready on http://${shown}:${options.port}${MCP_PATH}\n`);
    if (!isLoopback(options.host)) {
      process.stderr.write(
        'adb-mcp: WARNING listening beyond localhost — anyone who can reach this port has ' +
        'full control of the attached device.\n'
      );
    }
    return;
  }

  const { server } = createServer(config);
  await server.connect(new StdioServerTransport());
  process.stderr.write('adb-mcp: ready on stdio\n');
}

main().catch((err: unknown) => {
  // A bad flag is a user mistake, not a crash: show the message, not a stack trace.
  if (err instanceof CliError) {
    process.stderr.write(`adb-mcp: ${err.message}\n`);
    process.exit(2);
  }
  const message = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`adb-mcp: fatal: ${message}\n`);
  process.exit(1);
});
