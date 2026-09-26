import { z } from 'zod';
import { getDeviceInfo } from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/** One cheap call that answers "what am I testing on?" so agents stop rediscovering it. */
export function registerDeviceInfoTool(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'get_device_info',
    {
      title: 'Get device information',
      description:
        'Returns OS version, SDK level, manufacturer, model, ABI, screen size, density, ' +
        'battery level and dark-mode state for the target device. Call this before ' +
        'reasoning about layout, API availability or power behaviour.',
      inputSchema: {
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to the target set by set_target.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('get_device_info', async ({ device }) => {
      const deviceId = device ?? (await target.resolveDevice());
      return jsonResult(await getDeviceInfo(target.adb.runner, deviceId));
    })
  );
}
