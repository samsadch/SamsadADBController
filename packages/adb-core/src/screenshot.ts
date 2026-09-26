import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AdbRunner } from './exec';
import { TRANSFER_TIMEOUT_MS } from './types';

/**
 * Captures screen as a raw PNG Buffer.
 * Uses `exec-out screencap -p` with binary buffer reading to avoid string encoding issues and shell redirects.
 */
export async function captureScreenshotBuffer(runner: AdbRunner, deviceId: string): Promise<Buffer> {
  return await runner.runBinary(deviceId, ['exec-out', 'screencap', '-p'], {
    timeoutMs: TRANSFER_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024
  });
}

/**
 * Screen capture saved to file and optionally copied to macOS clipboard.
 */
export async function captureScreenshot(
  runner: AdbRunner,
  deviceId: string,
  outputPath?: string
): Promise<string> {
  const targetFile = outputPath ?? path.join(os.tmpdir(), `adb_screenshot_${Date.now()}.png`);
  const buffer = await captureScreenshotBuffer(runner, deviceId);
  await fs.promises.writeFile(targetFile, buffer);

  if (process.platform === 'darwin') {
    exec(`osascript -e 'set the clipboard to (read (POSIX file "${targetFile}") as {«class PNGf»})'`);
  }
  return `Screenshot saved to ${targetFile}` +
    (process.platform === 'darwin' ? ' and copied to clipboard!' : '');
}

