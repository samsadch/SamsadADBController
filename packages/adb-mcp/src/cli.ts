/**
 * Command-line options.
 *
 * stdio stays the default so existing `npx -y @samsadch/adb-mcp` configs keep working;
 * `--http` exists for clients that cannot spawn a stdio process — Android Studio's Gemini
 * integration accepts only a streamable HTTP endpoint (`httpUrl`).
 */

export type TransportKind = 'stdio' | 'http';

export interface CliOptions {
  transport: TransportKind;
  port: number;
  host: string;
  /** Required before binding anywhere other than loopback. */
  allowExternal: boolean;
  help: boolean;
}

export const DEFAULT_PORT = 3579;
export const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

export class CliError extends Error {}

export const HELP_TEXT = `adb-mcp — MCP server for driving Android devices over ADB

Usage:
  adb-mcp [--http] [--port <n>] [--host <addr>] [--allow-external]

Transports:
  (default)          stdio — for Claude Code, Claude Desktop, Cursor, Windsurf, Antigravity
  --http             streamable HTTP — for clients that need a URL (e.g. Android Studio)

Options:
  --port <n>         HTTP port (default ${DEFAULT_PORT}, or ADB_MCP_PORT)
  --host <addr>      HTTP bind address (default 127.0.0.1, or ADB_MCP_HOST)
  --allow-external   Permit binding to a non-loopback address. This exposes full device
                     control — including arbitrary device shell commands and app data —
                     to anyone who can reach the port. Only use on a trusted network.
  -h, --help         Show this help

Environment:
  ADB_MCP_TRANSPORT  "http" to default to HTTP mode
  ADB_MCP_PORT       HTTP port
  ADB_MCP_HOST       HTTP bind address
  ADB_PATH           Explicit path to the adb binary
  ANDROID_HOME       Android SDK root
  SQLITE_PATH        Explicit path to the sqlite3 binary
`;

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CliError(`Invalid --port "${raw}": expected an integer between 1 and 65535.`);
  }
  return port;
}

export function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTS.includes(host.toLowerCase().replace(/^\[|\]$/g, ''));
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = {}): CliOptions {
  const options: CliOptions = {
    transport: (env.ADB_MCP_TRANSPORT || '').toLowerCase() === 'http' ? 'http' : 'stdio',
    port: env.ADB_MCP_PORT ? parsePort(env.ADB_MCP_PORT) : DEFAULT_PORT,
    host: env.ADB_MCP_HOST || '127.0.0.1',
    allowExternal: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // Accept both "--port 3579" and "--port=3579".
    const [flag, inlineValue] = arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, undefined];

    const takeValue = (): string => {
      const value = inlineValue ?? argv[++i];
      if (value === undefined) {
        throw new CliError(`${flag} requires a value.`);
      }
      return value;
    };

    switch (flag) {
      case '--http':
        options.transport = 'http';
        break;
      case '--stdio':
        options.transport = 'stdio';
        break;
      case '--port':
        options.port = parsePort(takeValue());
        break;
      case '--host':
        options.host = takeValue();
        break;
      case '--allow-external':
        options.allowExternal = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new CliError(`Unknown option "${arg}". Run with --help to see the options.`);
    }
  }

  // This server can run arbitrary shell commands on the attached device and read app data,
  // so listening beyond the local machine is an explicit, deliberate choice.
  if (options.transport === 'http' && !isLoopback(options.host) && !options.allowExternal) {
    throw new CliError(
      `Refusing to bind to "${options.host}": that exposes full device control to the network. ` +
      'Use 127.0.0.1, or pass --allow-external if you really intend to share it.'
    );
  }

  return options;
}
