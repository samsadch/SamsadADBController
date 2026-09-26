import * as fs from 'fs';
import * as path from 'path';
import { AdbRunner } from './exec';
import { TRANSFER_TIMEOUT_MS } from './types';

export interface ShellCommandResult {
  command: string;
  output: string;
  device: string;
}

/**
 * Pushes a local file or directory to a remote path on the Android device.
 */
export async function pushFile(
  runner: AdbRunner,
  deviceId: string,
  localPath: string,
  remotePath: string,
  options: { timeoutMs?: number } = {}
): Promise<string> {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file or directory does not exist: ${localPath}`);
  }

  const timeoutMs = options.timeoutMs ?? TRANSFER_TIMEOUT_MS;
  const output = await runner.run(deviceId, ['push', localPath, remotePath], { timeoutMs });
  return output.length > 0 ? output : `Pushed ${localPath} to ${remotePath}`;
}

/**
 * Pulls a remote file or directory from the Android device to a local path.
 */
export async function pullFile(
  runner: AdbRunner,
  deviceId: string,
  remotePath: string,
  localPath: string,
  options: { timeoutMs?: number } = {}
): Promise<string> {
  const localDir = path.dirname(path.resolve(localPath));
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  const timeoutMs = options.timeoutMs ?? TRANSFER_TIMEOUT_MS;
  const output = await runner.run(deviceId, ['pull', remotePath, localPath], { timeoutMs });
  return output.length > 0 ? output : `Pulled ${remotePath} to ${localPath}`;
}

/**
 * Executes an arbitrary shell command on the target Android device.
 */
export async function executeShellCommand(
  runner: AdbRunner,
  deviceId: string,
  command: string,
  options: { timeoutMs?: number; maxBuffer?: number } = {}
): Promise<ShellCommandResult> {
  if (!command || !command.trim()) {
    throw new Error('Command cannot be empty');
  }

  const output = await runner.run(deviceId, ['shell', command], options);
  return {
    command,
    output,
    device: deviceId
  };
}
