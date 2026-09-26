import * as os from 'os';
import * as path from 'path';
import { AdbConfig } from './types';

/**
 * Locating adb and sqlite3.
 *
 * Previously this read VS Code settings directly via `require('vscode')`. Configuration is now
 * injected so the same code serves the extension, the MCP server and tests.
 */

const isWindows = process.platform === 'win32';
const exeName = isWindows ? 'adb.exe' : 'adb';

/** Ordered adb locations, most specific first. Duplicates are removed. */
export function getCandidateAdbPaths(config: AdbConfig = {}): string[] {
  const userHome = os.homedir();
  const configuredPath = (config.adbPath || process.env.ADB_PATH || '').trim();
  const configuredSdk = (config.androidSdkPath || '').trim();

  const candidates = [
    configuredPath || null,
    configuredSdk ? path.join(configuredSdk, 'platform-tools', exeName) : null,
    process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', exeName) : null,
    process.env.ANDROID_SDK_ROOT ? path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', exeName) : null,
    path.join(userHome, 'Library', 'Android', 'sdk', 'platform-tools', exeName),
    path.join(userHome, 'Android', 'Sdk', 'platform-tools', exeName),
    path.join(userHome, 'Android', 'sdk', 'platform-tools', exeName),
    path.join(userHome, '.android', 'sdk', 'platform-tools', exeName),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exeName) : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'sdk', 'platform-tools', exeName) : null,
    path.join(userHome, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', exeName),
    path.join(userHome, 'AppData', 'Local', 'Android', 'sdk', 'platform-tools', exeName),
    'C:\\Android\\sdk\\platform-tools\\adb.exe',
    'C:\\Android\\Sdk\\platform-tools\\adb.exe',
    'C:\\Program Files\\Android\\platform-tools\\adb.exe',
    'C:\\Program Files (x86)\\Android\\platform-tools\\adb.exe',
    '/opt/homebrew/bin/adb',
    '/usr/local/bin/adb',
    '/usr/bin/adb',
    '/bin/adb',
    exeName
  ].filter(Boolean) as string[];

  return Array.from(new Set(candidates));
}

/**
 * PATH with the usual SDK and package-manager locations appended.
 *
 * GUI-launched processes on macOS inherit a minimal PATH that omits /opt/homebrew/bin, so adb
 * and sqlite3 are invisible without this.
 */
export function buildExtendedPath(): string {
  const userHome = os.homedir();
  const extraPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    path.join(userHome, 'Library', 'Android', 'sdk', 'platform-tools'),
    path.join(userHome, 'Android', 'Sdk', 'platform-tools'),
    path.join(userHome, 'Android', 'sdk', 'platform-tools'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools') : ''
  ].filter(Boolean);
  const pathSep = isWindows ? ';' : ':';
  return `${process.env.PATH || ''}${pathSep}${extraPaths.join(pathSep)}`;
}

export function getSqliteCandidates(config: AdbConfig = {}): string[] {
  const configured = (config.sqlitePath || process.env.SQLITE_PATH || '').trim();
  const defaults = isWindows
    ? ['sqlite3.exe', 'C:\\Program Files\\sqlite3\\sqlite3.exe', 'C:\\sqlite3\\sqlite3.exe']
    : ['sqlite3', '/opt/homebrew/bin/sqlite3', '/usr/bin/sqlite3', '/usr/local/bin/sqlite3'];
  return [configured, ...defaults].filter(Boolean);
}
