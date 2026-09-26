import { z } from 'zod';
import { clearLogcat, getAppMemory, getLogcat, type LogLevel } from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers diagnostics tools: Logcat reader/clearer and process memory inspector.
 */
export function registerDiagnosticsTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'get_logcat',
    {
      title: 'Get Logcat logs',
      description:
        'Retrieves filtered Android system and application logs non-blockingly. ' +
        'Supports filtering by application package (PID-scoped), minimum log level, tag, and search query.',
      inputSchema: {
        packageName: z.string().optional().describe('Package applicationId to filter logs for. Defaults to sticky target package if set.'),
        filterByPackage: z.boolean().optional().default(true).describe('Filter logs to only this package/PID when packageName is present. Set to false to see system-wide logs.'),
        logLevel: z.enum(['V', 'D', 'I', 'W', 'E', 'F']).optional().describe('Minimum log level: V (Verbose), D (Debug), I (Info), W (Warn), E (Error), F (Fatal).'),
        tag: z.string().optional().describe('Filter logs by a specific Logcat tag (e.g. "ActivityManager", "AndroidRuntime").'),
        search: z.string().optional().describe('Case-insensitive substring search filter across log messages.'),
        lineLimit: z.number().int().positive().max(2000).optional().default(200).describe('Maximum number of recent log lines to return (1-2000, default 200).'),
        clearFirst: z.boolean().optional().default(false).describe('If true, clears the logcat buffer before capturing logs.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('get_logcat', async ({ packageName, filterByPackage, logLevel, tag, search, lineLimit, clearFirst, device }) => {
      const dev = device ?? (await target.resolveDevice());
      let pkg: string | undefined = packageName;
      if (!pkg && filterByPackage) {
        pkg = target.snapshot().package ?? undefined;
      }

      const result = await getLogcat(target.adb.runner, dev, {
        packageName: pkg,
        filterByPackage,
        logLevel: logLevel as LogLevel | undefined,
        tag,
        search,
        lineLimit,
        clearFirst
      });

      return jsonResult(result);
    })
  );

  server.registerTool(
    'clear_logcat',
    {
      title: 'Clear Logcat buffer',
      description: 'Clears the Android logcat circular buffer on the device.',
      inputSchema: {
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard('clear_logcat', async ({ device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await clearLogcat(target.adb.runner, dev);
      return textResult(msg);
    })
  );

  server.registerTool(
    'get_app_memory',
    {
      title: 'Inspect app memory consumption',
      description:
        'Analyzes process memory allocation for a given package using dumpsys meminfo. ' +
        'Provides structured totals in MB and detailed breakdowns of Java Heap, Native Heap, Graphics, Code, and Stack.',
      inputSchema: {
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('get_app_memory', async ({ packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const memInfo = await getAppMemory(target.adb.runner, dev, pkg);
      return jsonResult(memInfo);
    })
  );
}
