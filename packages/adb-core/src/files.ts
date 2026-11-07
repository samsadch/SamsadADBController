import * as fs from 'fs';
import * as path from 'path';
import { AdbRunner } from './exec';
import { TRANSFER_TIMEOUT_MS } from './types';

export interface ShellCommandResult {
  command: string;
  output: string;
  device: string;
}

export interface DeviceFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isLink: boolean;
  sizeBytes: number;
  sizeFormatted: string;
  permissions: string;
  date: string;
  linkTarget?: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function parseLsLine(line: string, parentPath: string): DeviceFileEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('total ') || trimmed.startsWith('ls:')) {
    return null;
  }

  // Regex matching standard Linux / Toybox / Android ls -la formats:
  // e.g.: drwxrwx--x 32 root sdcard_rw 4096 2026-09-20 15:42 Download
  // e.g.: -rw-rw----  1 u0_a123 u0_a123 124500 2026-09-21 11:20 sample.png
  // e.g.: lrwxrwxrwx  1 root root 11 2026-09-20 10:00 sdcard -> /storage/emulated/0
  const match = trimmed.match(/^([drwxlsStTx\-]{10})\s+(\d+)?\s*(\S+)\s+(\S+)\s+(\d+)?\s*(\d{4}-\d{2}-\d{2}|\w{3}\s+\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?|\d{4})\s+(.+)$/);

  if (match) {
    const permissions = match[1];
    const sizeBytes = match[5] ? parseInt(match[5], 10) : 0;
    const date = `${match[6]} ${match[7]}`;
    let rawName = match[8];
    let linkTarget: string | undefined;

    if (rawName.includes(' -> ')) {
      const parts = rawName.split(' -> ');
      rawName = parts[0];
      linkTarget = parts[1];
    }

    const isDirectory = permissions.startsWith('d') || (!permissions.startsWith('l') && rawName.endsWith('/'));
    const isLink = permissions.startsWith('l');
    const cleanName = rawName.replace(/\/$/, '');
    const cleanParent = parentPath.endsWith('/') ? parentPath : `${parentPath}/`;
    const fullPath = cleanParent === '//' ? `/${cleanName}` : `${cleanParent}${cleanName}`;

    return {
      name: cleanName,
      path: fullPath,
      isDirectory,
      isLink,
      sizeBytes,
      sizeFormatted: isDirectory ? '--' : formatFileSize(sizeBytes),
      permissions,
      date,
      linkTarget
    };
  }

  // Fallback split for minimal/custom tool outputs
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 4) {
    const permissions = tokens[0];
    const isDirectory = permissions.startsWith('d');
    const isLink = permissions.startsWith('l');
    const name = tokens.slice(tokens.length - 1)[0];
    if (name === '.' || name === '..') return null;
    const cleanParent = parentPath.endsWith('/') ? parentPath : `${parentPath}/`;
    const fullPath = `${cleanParent}${name}`;

    return {
      name,
      path: fullPath,
      isDirectory,
      isLink,
      sizeBytes: 0,
      sizeFormatted: isDirectory ? '--' : '0 B',
      permissions,
      date: ''
    };
  }

  return null;
}

/**
 * Lists the contents of a directory on the Android device.
 */
export async function listDirectory(
  runner: AdbRunner,
  deviceId: string,
  remotePath: string = '/sdcard'
): Promise<DeviceFileEntry[]> {
  const targetPath = remotePath.trim() || '/sdcard';
  const raw = await runner.run(deviceId, ['shell', `ls -la "${targetPath}"`]);
  const lines = raw.split('\n');
  const entries: DeviceFileEntry[] = [];

  for (const line of lines) {
    const entry = parseLsLine(line, targetPath);
    if (entry && entry.name !== '.' && entry.name !== '..') {
      entries.push(entry);
    }
  }

  return entries.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Creates a directory on the Android device.
 */
export async function createDirectory(
  runner: AdbRunner,
  deviceId: string,
  remotePath: string
): Promise<string> {
  await runner.run(deviceId, ['shell', `mkdir -p "${remotePath}"`]);
  return `Created directory ${remotePath}`;
}

/**
 * Deletes a file or directory on the Android device.
 */
export async function deleteDeviceFile(
  runner: AdbRunner,
  deviceId: string,
  remotePath: string
): Promise<string> {
  await runner.run(deviceId, ['shell', `rm -rf "${remotePath}"`]);
  return `Deleted ${remotePath}`;
}

/**
 * Moves or renames a file or directory on the Android device.
 */
export async function moveDeviceFile(
  runner: AdbRunner,
  deviceId: string,
  sourcePath: string,
  destPath: string
): Promise<string> {
  await runner.run(deviceId, ['shell', `mv "${sourcePath}" "${destPath}"`]);
  return `Moved ${sourcePath} to ${destPath}`;
}

/**
 * Reads text content of a file directly on the Android device without host filesystem pull.
 */
export async function readDeviceFileText(
  runner: AdbRunner,
  deviceId: string,
  remotePath: string,
  options: { maxLines?: number } = {}
): Promise<string> {
  const maxLines = options.maxLines ?? 1000;
  const output = await runner.run(deviceId, ['shell', `head -n ${maxLines} "${remotePath}"`]);
  return output;
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
