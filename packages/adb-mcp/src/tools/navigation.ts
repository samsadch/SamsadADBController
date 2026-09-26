import { z } from 'zod';
import { openDeepLink } from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers navigation and deep link dispatching tools.
 */
export function registerNavigationTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'open_deep_link',
    {
      title: 'Open deep link or URL scheme',
      description:
        'Dispatches an Android VIEW Intent with a URI (e.g. "https://example.com/path" or "myapp://item/42"). ' +
        'Optionally targets a specific package name to prevent chooser dialogs.',
      inputSchema: {
        url: z.string().describe('Deep link URI or web URL to dispatch.'),
        packageName: z
          .string()
          .optional()
          .describe('Optional package name to route the Intent directly to.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('open_deep_link', async ({ url, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await openDeepLink(target.adb.runner, dev, url, packageName);
      return jsonResult({ opened: true, ...res, device: dev });
    })
  );
}
