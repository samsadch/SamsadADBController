import * as fs from 'fs';
import { AdbError } from './errors';
import { AdbRunner } from './exec';
import { TRANSFER_TIMEOUT_MS } from './types';

export interface InstallOptions {
  grantPermissions?: boolean;
  reinstall?: boolean;
  allowDowngrade?: boolean;
  allowTestOnly?: boolean;
}

export interface PackageFilterOptions {
  filter?: 'third_party' | 'system' | 'all' | 'enabled' | 'disabled';
  query?: string;
  includeApkPath?: boolean;
}

export interface PackageEntry {
  packageName: string;
  apkPath?: string;
}

export interface StartAppOptions {
  activity?: string;
  stopFirst?: boolean;
}

export interface AppInfo {
  packageName: string;
  versionName?: string;
  versionCode?: number;
  minSdk?: number;
  targetSdk?: number;
  installer?: string;
  firstInstallTime?: string;
  lastUpdateTime?: string;
  requestedPermissions: string[];
  grantedPermissions: string[];
}

/**
 * Normalizes permission name to full Android format (e.g. CAMERA -> android.permission.CAMERA).
 */
export function normalizePermissionName(permission: string): string {
  const trimmed = permission.trim();
  if (trimmed.includes('.')) {
    return trimmed;
  }
  return `android.permission.${trimmed.toUpperCase()}`;
}

/**
 * Installs an APK file from the host machine onto the target device.
 */
export async function installApp(
  runner: AdbRunner,
  deviceId: string,
  apkPath: string,
  options: InstallOptions = {}
): Promise<string> {
  if (!fs.existsSync(apkPath)) {
    throw new AdbError(
      'FILE_NOT_FOUND',
      `APK file not found at: ${apkPath}`,
      'Check the local path to the APK file and verify it exists.'
    );
  }

  const args: string[] = ['install'];
  if (options.reinstall !== false) {
    args.push('-r');
  }
  if (options.grantPermissions !== false) {
    args.push('-g');
  }
  if (options.allowDowngrade === true) {
    args.push('-d');
  }
  if (options.allowTestOnly !== false) {
    args.push('-t');
  }
  args.push(apkPath);

  return await runner.run(deviceId, args, {
    timeoutMs: TRANSFER_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024
  });
}

/**
 * Uninstalls an application from the device.
 */
export async function uninstallApp(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  keepData = false
): Promise<string> {
  if (keepData) {
    return await runner.run(deviceId, ['shell', 'pm', 'uninstall', '-k', pkg]);
  }
  return await runner.run(deviceId, ['uninstall', pkg]);
}

/**
 * Clears user data and cache for an application (`pm clear`).
 */
export async function clearAppData(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  restart = false
): Promise<string> {
  const output = await runner.run(deviceId, ['shell', 'pm', 'clear', pkg]);
  if (restart) {
    await launchApp(runner, deviceId, pkg);
  }
  return output;
}

/**
 * Force-stops an application process (`am force-stop`).
 */
export function forceStopApp(runner: AdbRunner, deviceId: string, pkg: string): Promise<string> {
  return runner.run(deviceId, ['shell', 'am', 'force-stop', pkg]);
}

/**
 * Starts the launcher activity without needing to know its class name.
 */
export function launchApp(runner: AdbRunner, deviceId: string, pkg: string): Promise<string> {
  return runner.run(
    deviceId,
    ['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']
  );
}

/**
 * Starts an app, optionally launching a specific activity component or restarting first.
 */
export async function startApp(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  options: StartAppOptions = {}
): Promise<string> {
  if (options.stopFirst) {
    await forceStopApp(runner, deviceId, pkg);
  }

  if (options.activity) {
    let component = options.activity.trim();
    if (!component.includes('/')) {
      component = `${pkg}/${component.startsWith('.') ? component : `.${component}`}`;
    }
    return await runner.run(deviceId, ['shell', 'am', 'start', '-n', component]);
  }

  return await launchApp(runner, deviceId, pkg);
}

/**
 * Restarts an application (force-stop followed by start).
 */
export async function restartApp(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  options: StartAppOptions = {}
): Promise<string> {
  await forceStopApp(runner, deviceId, pkg);
  return await startApp(runner, deviceId, pkg, options);
}

/**
 * Clears app data and restarts the application.
 */
export async function clearAndRestartApp(
  runner: AdbRunner,
  deviceId: string,
  pkg: string
): Promise<string> {
  return await clearAppData(runner, deviceId, pkg, true);
}

/**
 * Opens system App Info settings for the target package.
 */
export function openAppInfo(runner: AdbRunner, deviceId: string, pkg: string): Promise<string> {
  return runner.run(
    deviceId,
    ['shell', 'am', 'start', '-a', 'android.settings.APPLICATION_DETAILS_SETTINGS', '-d', `package:${pkg}`]
  );
}

/**
 * Grants a runtime permission to the specified package.
 */
export async function grantPermission(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  permission: string
): Promise<{ granted: boolean; permission: string; output: string }> {
  const perm = normalizePermissionName(permission);
  const output = await runner.run(deviceId, ['shell', 'pm', 'grant', pkg, perm]);
  return { granted: true, permission: perm, output };
}

/**
 * Revokes a runtime permission from the specified package.
 */
export async function revokePermission(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  permission: string
): Promise<{ revoked: boolean; permission: string; output: string }> {
  const perm = normalizePermissionName(permission);
  const output = await runner.run(deviceId, ['shell', 'pm', 'revoke', pkg, perm]);
  return { revoked: true, permission: perm, output };
}

/**
 * Queries installed packages with filtering and optional APK paths.
 */
export async function listPackages(
  runner: AdbRunner,
  deviceId: string,
  options: PackageFilterOptions = {}
): Promise<PackageEntry[]> {
  const filter = options.filter ?? 'third_party';
  const args: string[] = ['shell', 'pm', 'list', 'packages'];

  if (filter === 'third_party') {
    args.push('-3');
  } else if (filter === 'system') {
    args.push('-s');
  } else if (filter === 'enabled') {
    args.push('-e');
  } else if (filter === 'disabled') {
    args.push('-d');
  }

  if (options.includeApkPath) {
    args.push('-f');
  }

  try {
    const output = await runner.run(deviceId, args);
    const query = (options.query || '').toLowerCase();

    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('package:'))
      .map(line => {
        const raw = line.slice('package:'.length);
        if (options.includeApkPath && raw.includes('=')) {
          const lastEq = raw.lastIndexOf('=');
          return {
            apkPath: raw.substring(0, lastEq),
            packageName: raw.substring(lastEq + 1)
          };
        }
        return { packageName: raw };
      })
      .filter(entry => entry.packageName.length > 0 && (!query || entry.packageName.toLowerCase().includes(query)))
      .sort((a, b) => a.packageName.localeCompare(b.packageName));
  } catch {
    return [];
  }
}

/**
 * Backward compatibility helper: Third-party packages only (`-3`).
 */
export async function getInstalledPackages(runner: AdbRunner, deviceId: string): Promise<string[]> {
  const list = await listPackages(runner, deviceId, { filter: 'third_party' });
  return list.map(item => item.packageName);
}

/**
 * Inspects package details and permissions via `dumpsys package <pkg>`.
 */
export async function getAppInfo(
  runner: AdbRunner,
  deviceId: string,
  pkg: string
): Promise<AppInfo> {
  const output = await runner.run(deviceId, ['shell', 'dumpsys', 'package', pkg]);

  const versionNameMatch = /versionName=([^\s]+)/.exec(output);
  const versionCodeMatch = /versionCode=(\d+)/.exec(output);
  const minSdkMatch = /minSdk=(\d+)/.exec(output);
  const targetSdkMatch = /targetSdk=(\d+)/.exec(output);
  const installerMatch = /installerPackageName=([^\s]+)/.exec(output);
  const firstInstallMatch = /firstInstallTime=([^\n]+)/.exec(output);
  const lastUpdateMatch = /lastUpdateTime=([^\n]+)/.exec(output);

  const requestedPermissions: string[] = [];
  const grantedPermissions: string[] = [];

  const requestedBlock = output.match(/requested permissions:\s*([\s\S]*?)(?:install permissions:|runtime permissions:|\n\n)/i);
  if (requestedBlock) {
    const lines = requestedBlock[1].split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.includes('.')) {
        requestedPermissions.push(trimmed);
      }
    }
  }

  const runtimeBlock = output.match(/(?:runtime permissions:|install permissions:)\s*([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i);
  if (runtimeBlock) {
    const lines = runtimeBlock[1].split('\n');
    for (const line of lines) {
      const match = /^\s*([a-zA-Z0-9_.]+):\s*granted=true/i.exec(line);
      if (match) {
        grantedPermissions.push(match[1]);
      }
    }
  }

  return {
    packageName: pkg,
    versionName: versionNameMatch ? versionNameMatch[1] : undefined,
    versionCode: versionCodeMatch ? parseInt(versionCodeMatch[1], 10) : undefined,
    minSdk: minSdkMatch ? parseInt(minSdkMatch[1], 10) : undefined,
    targetSdk: targetSdkMatch ? parseInt(targetSdkMatch[1], 10) : undefined,
    installer: installerMatch ? installerMatch[1] : undefined,
    firstInstallTime: firstInstallMatch ? firstInstallMatch[1].trim() : undefined,
    lastUpdateTime: lastUpdateMatch ? lastUpdateMatch[1].trim() : undefined,
    requestedPermissions: Array.from(new Set(requestedPermissions)),
    grantedPermissions: Array.from(new Set(grantedPermissions))
  };
}
