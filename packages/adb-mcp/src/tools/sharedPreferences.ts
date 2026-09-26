import { z } from 'zod';
import {
  clearSharedPreferencesFile,
  deleteSharedPreferenceValue,
  getSharedPreferenceValue,
  getSharedPrefsFiles,
  readAllSharedPreferences,
  setSharedPreferenceValue
} from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers SharedPreferences exploration, inspection, and manipulation tools.
 */
export function registerSharedPreferencesTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'list_shared_preferences',
    {
      title: 'List SharedPreferences XML files',
      description: 'Discovers all SharedPreferences `.xml` files in `/data/data/<pkg>/shared_prefs/`.',
      inputSchema: {
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('list_shared_preferences', async ({ packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const files = await getSharedPrefsFiles(target.adb.runner, dev, pkg);
      return jsonResult({ files, total: files.length, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'read_shared_preferences',
    {
      title: 'Read all SharedPreferences key-values',
      description: 'Reads all key-value pairs stored in a preferences XML file with exact data types.',
      inputSchema: {
        fileName: z.string().describe('SharedPreferences file name (e.g. "user_prefs.xml" or "app_config").'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('read_shared_preferences', async ({ fileName, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const result = await readAllSharedPreferences(target.adb.runner, dev, pkg, fileName);
      return jsonResult({ ...result, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'get_shared_preference',
    {
      title: 'Get a specific preference key value & type',
      description: 'Fetches a single key value and its explicit data type from a SharedPreferences file.',
      inputSchema: {
        fileName: z.string().describe('SharedPreferences file name.'),
        key: z.string().describe('Key name to look up.'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('get_shared_preference', async ({ fileName, key, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const entry = await getSharedPreferenceValue(target.adb.runner, dev, pkg, fileName, key);
      return jsonResult({ fileName, key, entry, exists: entry !== null, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'set_shared_preference',
    {
      title: 'Set or update a preference key-value',
      description: 'Inserts or modifies a preference key-value pair with automatic or explicit data type.',
      inputSchema: {
        fileName: z.string().describe('SharedPreferences file name.'),
        key: z.string().describe('Key name to set.'),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).describe('Value to store.'),
        type: z
          .enum(['string', 'boolean', 'int', 'long', 'float', 'set'])
          .optional()
          .describe('Explicit data type. Auto-detected if omitted.'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('set_shared_preference', async ({ fileName, key, value, type, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const entry = await setSharedPreferenceValue(target.adb.runner, dev, pkg, fileName, key, value, type);
      return jsonResult({ updated: true, fileName, entry, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'delete_shared_preference',
    {
      title: 'Delete a specific preference key',
      description: 'Removes a key-value entry from a SharedPreferences XML file.',
      inputSchema: {
        fileName: z.string().describe('SharedPreferences file name.'),
        key: z.string().describe('Key name to delete.'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('delete_shared_preference', async ({ fileName, key, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const res = await deleteSharedPreferenceValue(target.adb.runner, dev, pkg, fileName, key);
      return jsonResult({ ...res, fileName, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'clear_shared_preferences',
    {
      title: 'Clear all preferences in a file',
      description: 'Wipes all key-value pairs in a SharedPreferences file, resetting it to `<map></map>`.',
      inputSchema: {
        fileName: z.string().describe('SharedPreferences file name to clear.'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('clear_shared_preferences', async ({ fileName, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      await clearSharedPreferencesFile(target.adb.runner, dev, pkg, fileName);
      return textResult(`Cleared all preferences in ${fileName} on ${dev}`);
    })
  );
}
