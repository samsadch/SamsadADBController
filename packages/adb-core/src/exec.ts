import { exec, execFile } from 'child_process';
import * as fs from 'fs';
import { buildExtendedPath, getCandidateAdbPaths } from './adbPath';
import { AdbError, AdbErrorCode, normalizeAdbError, timeoutError } from './errors';
import { AdbConfig, DEFAULT_TIMEOUT_MS, RunOptions } from './types';

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Failures that prove adb itself ran: the device or the command was at fault, so probing
 * further adb binaries would only repeat the same error once per candidate path.
 */
const DEVICE_SIDE_CODES: ReadonlySet<AdbErrorCode> = new Set<AdbErrorCode>([
  'NO_DEVICE',
  'AMBIGUOUS_DEVICE',
  'DEVICE_OFFLINE',
  'DEVICE_UNAUTHORIZED',
  'NOT_DEBUGGABLE',
  'PACKAGE_NOT_FOUND',
  'TIMEOUT'
]);

/**
 * Runs adb and caches the binary that worked.
 *
 * Commands go through a shell rather than execFile because several callers rely on shell
 * redirection inside the command string (`exec-out run-as … cat … > file`). Argument quoting
 * is deliberately identical to the pre-extraction implementation; see `quote`.
 */
export class AdbRunner {
  private adbPath = 'adb';
  private resolved = false;

  constructor(private readonly config: AdbConfig = {}) {}

  /** Environment carrying the extended PATH, for callers that spawn adb themselves. */
  public getEnv(): NodeJS.ProcessEnv {
    return { ...process.env, PATH: buildExtendedPath() };
  }

  /** Resolves and caches a working adb binary, for callers that need to stream its stdio. */
  public async resolveAdbBinary(): Promise<string> {
    if (!this.resolved) {
      await this.run(null, ['version'], {});
    }
    return this.adbPath;
  }

  /** Variadic form, kept so the existing IDE call sites need no changes. */
  public runAdb(deviceId: string | null, ...args: string[]): Promise<string> {
    return this.run(deviceId, args, {});
  }

  /**
   * Runs adb and captures raw binary output directly without shell wrapping or string corruption.
   * Essential for screencap, pull, and binary streams.
   */
  public async runBinary(deviceId: string | null, args: string[], options: RunOptions = {}): Promise<Buffer> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBuffer = options.maxBuffer ?? (64 * 1024 * 1024);
    const extendedPath = buildExtendedPath();

    const candidates = getCandidateAdbPaths(this.config);
    const pathsToTry = this.resolved
      ? [this.adbPath]
      : [this.adbPath, ...candidates.filter(p => p !== this.adbPath)];

    let lastError: AdbError = new AdbError(
      'ADB_NOT_FOUND',
      'No adb binary could be found or executed.',
      'Install Android SDK platform-tools, or set ANDROID_HOME / ADB_PATH.'
    );

    for (const adbBin of pathsToTry) {
      if (adbBin !== 'adb' && adbBin !== 'adb.exe' && !fs.existsSync(adbBin)) {
        continue;
      }
      const fullArgs = deviceId ? ['-s', deviceId, ...args] : args;

      try {
        const buffer = await new Promise<Buffer>((resolve, reject) => {
          execFile(
            adbBin,
            fullArgs,
            { env: { ...process.env, PATH: extendedPath }, maxBuffer, timeout: timeoutMs, encoding: 'buffer' },
            (error, stdout, stderr) => {
              if (!error) {
                resolve(stdout as Buffer);
                return;
              }
              if ((error as { killed?: boolean }).killed) {
                reject(timeoutError(args.join(' '), timeoutMs));
                return;
              }
              const errStr = (
                (Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr || '')) ||
                (Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout || '')) ||
                error.message
              ).trim();
              reject(normalizeAdbError(errStr));
            }
          );
        });
        this.adbPath = adbBin;
        this.resolved = true;
        return buffer;
      } catch (err) {
        const normalized = normalizeAdbError(err);
        if (this.resolved || DEVICE_SIDE_CODES.has(normalized.code)) {
          this.adbPath = adbBin;
          this.resolved = true;
          throw normalized;
        }
        lastError = normalized;
      }
    }
    throw lastError;
  }

  /**
   * Runs adb with an explicit timeout.
   *
   * The previous fixed 15s ceiling failed on database pulls and app-data exports; transfers
   * should pass `TRANSFER_TIMEOUT_MS`.
   */
  public async run(deviceId: string | null, args: string[], options: RunOptions = {}): Promise<string> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
    const extendedPath = buildExtendedPath();

    const candidates = getCandidateAdbPaths(this.config);
    const pathsToTry = this.resolved
      ? [this.adbPath]
      : [this.adbPath, ...candidates.filter(p => p !== this.adbPath)];

    let lastError: AdbError = new AdbError(
      'ADB_NOT_FOUND',
      'No adb binary could be found or executed.',
      'Install Android SDK platform-tools, or set ANDROID_HOME / ADB_PATH.'
    );

    for (const adbBin of pathsToTry) {
      if (adbBin !== 'adb' && adbBin !== 'adb.exe' && !fs.existsSync(adbBin)) {
        continue;
      }
      const fullArgs = deviceId ? ['-s', deviceId, ...args] : args;
      const command = `"${adbBin}" ${fullArgs.map(quote).join(' ')}`;

      try {
        const stdout = await new Promise<string>((resolve, reject) => {
          exec(
            command,
            { env: { ...process.env, PATH: extendedPath }, maxBuffer, timeout: timeoutMs },
            (error, out, stderr) => {
              if (!error) {
                resolve(out.trim());
                return;
              }
              if ((error as { killed?: boolean }).killed) {
                reject(timeoutError(args.join(' '), timeoutMs));
                return;
              }
              reject(normalizeAdbError((stderr || out || error.message).trim()));
            }
          );
        });
        this.adbPath = adbBin;
        this.resolved = true;
        return stdout;
      } catch (err) {
        const normalized = normalizeAdbError(err);
        if (this.resolved || DEVICE_SIDE_CODES.has(normalized.code)) {
          // adb works; the failure is real. Remember the binary and surface the error.
          this.adbPath = adbBin;
          this.resolved = true;
          throw normalized;
        }
        lastError = normalized;
      }
    }
    throw lastError;
  }
}

/**
 * Quotes a single argument.
 *
 * Intentionally byte-identical to the pre-extraction rule: arguments containing a space are
 * wrapped in double quotes, everything else is passed through. Callers that embed a shell
 * redirect in an argument depend on this exact behaviour.
 */
function quote(arg: string): string {
  return arg.includes(' ') ? `"${arg}"` : arg;
}
