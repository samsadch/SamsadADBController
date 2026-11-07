import { z } from 'zod';
import { assertUiElement, tapBySelector } from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers semantic UI interaction and verification tools for AI agents.
 */
export function registerSemanticUiTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'tap_by_text',
    {
      title: 'Tap UI element by visible text',
      description: 'Locates a UI element matching visible text, calculates its center bounds, and dispatches a touch tap. Eliminates manual coordinate extraction.',
      inputSchema: {
        text: z.string().describe('Visible text on the button, label, or view to tap.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('tap_by_text', async ({ text, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await tapBySelector(target.adb.runner, dev, { text });
      return textResult(res.message);
    })
  );

  server.registerTool(
    'tap_by_id',
    {
      title: 'Tap UI element by resource-id',
      description: 'Locates a UI element matching an Android resource-id (e.g. "btn_submit", "com.example:id/save"), calculates center bounds, and taps it.',
      inputSchema: {
        resourceId: z.string().describe('Resource ID of the target element to tap.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('tap_by_id', async ({ resourceId, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await tapBySelector(target.adb.runner, dev, { resourceId });
      return textResult(res.message);
    })
  );

  server.registerTool(
    'assert_ui_element',
    {
      title: 'Assert UI element visibility',
      description: 'Verifies whether an element with matching text, resource-id, or content-desc currently appears on the device screen.',
      inputSchema: {
        text: z.string().optional().describe('Text to match.'),
        resourceId: z.string().optional().describe('Resource-id to match.'),
        contentDesc: z.string().optional().describe('Accessibility content description to match.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('assert_ui_element', async ({ text, resourceId, contentDesc, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await assertUiElement(target.adb.runner, dev, { text, resourceId, contentDesc });
      return jsonResult(res);
    })
  );
}
