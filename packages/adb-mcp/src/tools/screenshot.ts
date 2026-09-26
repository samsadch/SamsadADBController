import * as fs from 'node:fs';
import { z } from 'zod';
import { captureScreenshotBuffer } from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, imageResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers the screenshot tool for capturing device screen as multimodal PNG images.
 */
export function registerScreenshotTool(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'take_screenshot',
    {
      title: 'Take device screenshot',
      description:
        'Captures a live screenshot of the connected Android device screen as a PNG image. ' +
        'Returns multimodal image content suitable for visual analysis and verification.',
      inputSchema: {
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.'),
        savePath: z
          .string()
          .optional()
          .describe('Optional local file path to save the captured PNG image to.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('take_screenshot', async ({ device, savePath }) => {
      const dev = device ?? (await target.resolveDevice());
      const buffer = await captureScreenshotBuffer(target.adb.runner, dev);

      if (savePath) {
        await fs.promises.writeFile(savePath, buffer);
      }

      const caption = savePath
        ? `Screenshot captured from ${dev} and saved to ${savePath}`
        : `Screenshot captured from ${dev}`;

      return imageResult(buffer.toString('base64'), 'image/png', caption);
    })
  );
}
