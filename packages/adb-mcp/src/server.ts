import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AdbExecutor, type AdbConfig } from '@samsadch/adb-core';
import { TargetStore } from './targetStore.js';
import { registerTargetTools } from './tools/target.js';
import { registerDeviceInfoTool } from './tools/deviceInfo.js';
import { registerScreenshotTool } from './tools/screenshot.js';
import { registerUiHierarchyTools } from './tools/uiHierarchy.js';
import { registerInputTools } from './tools/input.js';
import { registerNavigationTools } from './tools/navigation.js';
import { registerAppTools } from './tools/apps.js';
import { registerDatabaseTools } from './tools/database.js';
import { registerSharedPreferencesTools } from './tools/sharedPreferences.js';
import { registerDiagnosticsTools } from './tools/diagnostics.js';
import { registerDeviceControlTools } from './tools/deviceControls.js';
import { registerSystemTools } from './tools/system.js';

// Read from package.json rather than a literal, so the version reported over MCP can never
// drift from the published one. package.json is always present in the tarball.
const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

export const SERVER_NAME = 'adb-mcp';
export const SERVER_VERSION = version;

/**
 * Builds the server and registers the full tool set.
 */
export function createServer(config: AdbConfig = {}): { server: McpServer; target: TargetStore } {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Drives a connected Android device over ADB. Call set_target once to pin the device ' +
        'and package, then use the other tools without repeating them. If a call reports ' +
        'NO_DEVICE or AMBIGUOUS_DEVICE, run list_devices and set_target.'
    }
  );

  const target = new TargetStore(new AdbExecutor(config));
  target.attachServer(server.server);

  registerTargetTools(server, target);
  registerDeviceInfoTool(server, target);
  registerScreenshotTool(server, target);
  registerUiHierarchyTools(server, target);
  registerInputTools(server, target);
  registerNavigationTools(server, target);
  registerAppTools(server, target);
  registerDatabaseTools(server, target);
  registerSharedPreferencesTools(server, target);
  registerDiagnosticsTools(server, target);
  registerDeviceControlTools(server, target);
  registerSystemTools(server, target);

  return { server, target };
}

/** Reads host configuration from the environment the MCP client spawned us with. */
export function configFromEnv(): AdbConfig {
  return {
    adbPath: process.env.ADB_PATH,
    androidSdkPath: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT,
    sqlitePath: process.env.SQLITE_PATH
  };
}
