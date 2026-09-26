import { z } from 'zod';
import {
  clearAppData,
  forceStopApp,
  getAppInfo,
  grantPermission,
  installApp,
  listPackages,
  restartApp,
  revokePermission,
  startApp,
  uninstallApp
} from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers application lifecycle, package management, and permission tools.
 */
export function registerAppTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'install_app',
    {
      title: 'Install APK on device',
      description:
        'Installs an APK file from the host filesystem onto the target device with optional permission granting and reinstall flags.',
      inputSchema: {
        apkPath: z
          .string()
          .describe('Absolute local filesystem path to the .apk file on the host machine.'),
        grantPermissions: z
          .boolean()
          .optional()
          .default(true)
          .describe('Grant all runtime permissions listed in the manifest (-g flag). Default true.'),
        reinstall: z
          .boolean()
          .optional()
          .default(true)
          .describe('Reinstall existing app, keeping its data (-r flag). Default true.'),
        allowDowngrade: z
          .boolean()
          .optional()
          .default(false)
          .describe('Allow version downgrade (-d flag). Default false.'),
        allowTestOnly: z
          .boolean()
          .optional()
          .default(true)
          .describe('Allow test-only packages (-t flag). Default true.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('install_app', async ({ apkPath, grantPermissions, reinstall, allowDowngrade, allowTestOnly, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const output = await installApp(target.adb.runner, dev, apkPath, {
        grantPermissions,
        reinstall,
        allowDowngrade,
        allowTestOnly
      });
      return textResult(`Installed ${apkPath} on ${dev}${output ? `: ${output}` : ''}`);
    })
  );

  server.registerTool(
    'uninstall_app',
    {
      title: 'Uninstall application',
      description: 'Uninstalls an application package from the device.',
      inputSchema: {
        packageName: z
          .string()
          .optional()
          .describe('Package applicationId to uninstall. Defaults to sticky target package.'),
        keepData: z
          .boolean()
          .optional()
          .default(false)
          .describe('Keep application data and cache directories (-k flag). Default false.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('uninstall_app', async ({ packageName, keepData, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const output = await uninstallApp(target.adb.runner, dev, pkg, keepData);
      return textResult(`Uninstalled ${pkg} from ${dev}${output ? `: ${output}` : ''}`);
    })
  );

  server.registerTool(
    'list_packages',
    {
      title: 'List installed packages',
      description:
        'Queries installed applications on the device with filtering by third-party, system, or enabled/disabled state.',
      inputSchema: {
        filter: z
          .enum(['third_party', 'system', 'all', 'enabled', 'disabled'])
          .optional()
          .default('third_party')
          .describe('Filter packages: "third_party" (default), "system", "all", "enabled", or "disabled".'),
        query: z
          .string()
          .optional()
          .describe('Optional search query to filter package names by substring.'),
        includeApkPath: z
          .boolean()
          .optional()
          .default(false)
          .describe('When true, returns the filesystem path to the installed base APK.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('list_packages', async ({ filter, query, includeApkPath, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const packages = await listPackages(target.adb.runner, dev, {
        filter: filter ?? 'third_party',
        query,
        includeApkPath
      });
      return jsonResult({
        filter: filter ?? 'third_party',
        total: packages.length,
        packages,
        device: dev
      });
    })
  );

  server.registerTool(
    'start_app',
    {
      title: 'Start application or activity',
      description:
        'Launches an application main launcher activity or starts a specific Activity class component.',
      inputSchema: {
        packageName: z
          .string()
          .optional()
          .describe('Package applicationId to start. Defaults to sticky target package.'),
        activity: z
          .string()
          .optional()
          .describe('Optional specific Activity component to launch (e.g. ".MainActivity" or "com.example.app/.ui.HomeActivity").'),
        stopFirst: z
          .boolean()
          .optional()
          .default(false)
          .describe('When true, force-stops the app before starting to guarantee a cold launch.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('start_app', async ({ packageName, activity, stopFirst, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const output = await startApp(target.adb.runner, dev, pkg, { activity, stopFirst });
      return textResult(`Started ${pkg}${activity ? ` (${activity})` : ''} on ${dev}${output ? `:\n${output}` : ''}`);
    })
  );

  server.registerTool(
    'stop_app',
    {
      title: 'Force-stop application',
      description: 'Terminates all running processes of the target application package (`am force-stop`).',
      inputSchema: {
        packageName: z
          .string()
          .optional()
          .describe('Package applicationId to stop. Defaults to sticky target package.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('stop_app', async ({ packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      await forceStopApp(target.adb.runner, dev, pkg);
      return textResult(`Force-stopped ${pkg} on ${dev}`);
    })
  );

  server.registerTool(
    'restart_app',
    {
      title: 'Restart application',
      description: 'Force-stops and re-launches the application for a clean restart.',
      inputSchema: {
        packageName: z
          .string()
          .optional()
          .describe('Package applicationId to restart. Defaults to sticky target package.'),
        activity: z
          .string()
          .optional()
          .describe('Optional specific Activity class to start after stopping.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('restart_app', async ({ packageName, activity, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const output = await restartApp(target.adb.runner, dev, pkg, { activity });
      return textResult(`Restarted ${pkg}${activity ? ` (${activity})` : ''} on ${dev}${output ? `:\n${output}` : ''}`);
    })
  );

  server.registerTool(
    'clear_app_data',
    {
      title: 'Clear application data and cache',
      description: 'Clears all user data, database records, and cache for the application (`pm clear`).',
      inputSchema: {
        packageName: z
          .string()
          .optional()
          .describe('Package applicationId whose data to reset. Defaults to sticky target package.'),
        restart: z
          .boolean()
          .optional()
          .default(false)
          .describe('Automatically relaunch the application after clearing data. Default false.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('clear_app_data', async ({ packageName, restart, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const output = await clearAppData(target.adb.runner, dev, pkg, restart);
      return textResult(`Cleared data for ${pkg} on ${dev}${restart ? ' and restarted app' : ''}${output ? `: ${output}` : ''}`);
    })
  );

  server.registerTool(
    'grant_permission',
    {
      title: 'Grant runtime permission',
      description:
        'Grants an Android runtime permission to the target application (e.g. "CAMERA", "POST_NOTIFICATIONS", "ACCESS_FINE_LOCATION").',
      inputSchema: {
        permission: z
          .string()
          .describe('Permission name (e.g. "CAMERA", "POST_NOTIFICATIONS", or full "android.permission.CAMERA").'),
        packageName: z
          .string()
          .optional()
          .describe('Package applicationId. Defaults to sticky target package.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('grant_permission', async ({ permission, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const res = await grantPermission(target.adb.runner, dev, pkg, permission);
      return jsonResult({ granted: true, permission: res.permission, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'revoke_permission',
    {
      title: 'Revoke runtime permission',
      description: 'Revokes a granted runtime permission from the application.',
      inputSchema: {
        permission: z
          .string()
          .describe('Permission name to revoke (e.g. "CAMERA", "POST_NOTIFICATIONS").'),
        packageName: z
          .string()
          .optional()
          .describe('Package applicationId. Defaults to sticky target package.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('revoke_permission', async ({ permission, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const res = await revokePermission(target.adb.runner, dev, pkg, permission);
      return jsonResult({ revoked: true, permission: res.permission, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'get_app_info',
    {
      title: 'Get application info and permissions',
      description:
        'Inspects installed package details: version name, version code, target SDK, min SDK, install times, and requested/granted permissions.',
      inputSchema: {
        packageName: z
          .string()
          .optional()
          .describe('Package applicationId to inspect. Defaults to sticky target package.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('get_app_info', async ({ packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const info = await getAppInfo(target.adb.runner, dev, pkg);
      return jsonResult({ info, device: dev });
    })
  );
}
