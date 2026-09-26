import assert from 'node:assert/strict';
import test from 'node:test';
import { CliError, DEFAULT_PORT, isLoopback, parseArgs } from '../out/cli.js';

test('defaults to stdio so existing npx configs keep working', () => {
  const opts = parseArgs([], {});
  assert.equal(opts.transport, 'stdio');
  assert.equal(opts.port, DEFAULT_PORT);
  assert.equal(opts.host, '127.0.0.1');
  assert.equal(opts.allowExternal, false);
});

test('--http selects the HTTP transport', () => {
  assert.equal(parseArgs(['--http'], {}).transport, 'http');
});

test('--port accepts both spaced and inline forms', () => {
  assert.equal(parseArgs(['--http', '--port', '4000'], {}).port, 4000);
  assert.equal(parseArgs(['--http', '--port=4001'], {}).port, 4001);
});

test('--host accepts loopback aliases', () => {
  assert.equal(parseArgs(['--http', '--host', 'localhost'], {}).host, 'localhost');
  assert.equal(parseArgs(['--http', '--host=::1'], {}).host, '::1');
});

test('environment variables provide defaults that flags override', () => {
  const fromEnv = parseArgs([], { ADB_MCP_TRANSPORT: 'http', ADB_MCP_PORT: '5000', ADB_MCP_HOST: 'localhost' });
  assert.equal(fromEnv.transport, 'http');
  assert.equal(fromEnv.port, 5000);
  assert.equal(fromEnv.host, 'localhost');

  const overridden = parseArgs(['--stdio', '--port', '6000'], { ADB_MCP_TRANSPORT: 'http', ADB_MCP_PORT: '5000' });
  assert.equal(overridden.transport, 'stdio');
  assert.equal(overridden.port, 6000);
});

test('refuses to bind beyond loopback without an explicit opt-in', () => {
  // This server runs arbitrary device shell commands; binding wide open must be deliberate.
  assert.throws(() => parseArgs(['--http', '--host', '0.0.0.0'], {}), CliError);
  assert.throws(() => parseArgs(['--http', '--host', '192.168.1.50'], {}), CliError);

  const allowed = parseArgs(['--http', '--host', '0.0.0.0', '--allow-external'], {});
  assert.equal(allowed.host, '0.0.0.0');
  assert.equal(allowed.allowExternal, true);
});

test('the loopback guard does not apply to stdio', () => {
  const opts = parseArgs(['--host', '0.0.0.0'], {});
  assert.equal(opts.transport, 'stdio');
});

test('rejects malformed ports', () => {
  for (const bad of ['0', '65536', 'abc', '-1', '3.5']) {
    assert.throws(() => parseArgs(['--http', '--port', bad], {}), CliError, `expected rejection for ${bad}`);
  }
});

test('rejects unknown flags and missing values', () => {
  assert.throws(() => parseArgs(['--nope'], {}), CliError);
  assert.throws(() => parseArgs(['--port'], {}), CliError);
});

test('--help is recognised in both forms', () => {
  assert.equal(parseArgs(['--help'], {}).help, true);
  assert.equal(parseArgs(['-h'], {}).help, true);
});

test('isLoopback recognises the usual local aliases', () => {
  for (const host of ['127.0.0.1', 'localhost', 'LOCALHOST', '::1', '[::1]']) {
    assert.equal(isLoopback(host), true, `${host} should be loopback`);
  }
  for (const host of ['0.0.0.0', '192.168.1.5', 'example.com']) {
    assert.equal(isLoopback(host), false, `${host} should not be loopback`);
  }
});
