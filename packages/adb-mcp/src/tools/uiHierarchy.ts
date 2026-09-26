import { z } from 'zod';
import { dumpViewHierarchy } from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers UI view hierarchy inspection tools.
 */
export function registerUiHierarchyTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'dump_view_hierarchy',
    {
      title: 'Dump UI view hierarchy',
      description:
        'Captures the current on-screen Android view hierarchy via UIAutomator, returning ' +
        'structured JSON nodes with text, resourceId, contentDesc, clickable state, and bounding box coordinates.',
      inputSchema: {
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.'),
        compressed: z
          .boolean()
          .optional()
          .default(true)
          .describe('When true (default), filters out non-interactive empty layout containers to reduce token consumption.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('dump_view_hierarchy', async ({ device, compressed }) => {
      const dev = device ?? (await target.resolveDevice());
      const hierarchy = await dumpViewHierarchy(target.adb.runner, dev, { compressed: compressed ?? true });
      return jsonResult(hierarchy);
    })
  );
}
