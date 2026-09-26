import { z } from 'zod';
import {
  tapCoordinates,
  tapElement,
  inputText,
  pressKey,
  swipeScreen
} from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers device interaction and input automation tools.
 */
export function registerInputTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'tap_coordinates',
    {
      title: 'Tap screen coordinates',
      description: 'Performs a single tap touch event at specific (x, y) pixel coordinates on the screen.',
      inputSchema: {
        x: z.number().describe('X coordinate on screen in pixels.'),
        y: z.number().describe('Y coordinate on screen in pixels.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('tap_coordinates', async ({ x, y, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await tapCoordinates(target.adb.runner, dev, x, y);
      return jsonResult({ tapped: true, coordinates: res, device: dev });
    })
  );

  server.registerTool(
    'tap_element',
    {
      title: 'Tap UI element by text or resource ID',
      description:
        'Finds an on-screen UI element by its text, resource ID, or content description and taps its center. ' +
        'Automatically inspects the view hierarchy to locate the target.',
      inputSchema: {
        text: z
          .string()
          .optional()
          .describe('Visible button or label text to find and tap (case-insensitive match).'),
        resourceId: z
          .string()
          .optional()
          .describe('Android resource-id (e.g. "btn_login" or "com.example.app:id/submit").'),
        contentDesc: z
          .string()
          .optional()
          .describe('Accessibility content description to match.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('tap_element', async ({ text, resourceId, contentDesc, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await tapElement(target.adb.runner, dev, { text, resourceId, contentDesc });
      return jsonResult({
        tapped: true,
        element: {
          text: res.element.text,
          resourceId: res.element.resourceId,
          contentDesc: res.element.contentDesc,
          className: res.element.className,
          bounds: res.element.bounds
        },
        tappedCoordinates: { x: res.x, y: res.y },
        device: dev
      });
    })
  );

  server.registerTool(
    'input_text',
    {
      title: 'Type text into active input field',
      description:
        'Types the specified string into the currently focused text field on the device. ' +
        'Automatically escapes spaces and shell characters.',
      inputSchema: {
        text: z.string().describe('Text string to type into the focused input field.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('input_text', async ({ text, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await inputText(target.adb.runner, dev, text);
      return textResult(`Typed "${res.text}" into active element on ${dev}.`);
    })
  );

  server.registerTool(
    'press_key',
    {
      title: 'Press hardware or navigation key',
      description:
        'Dispatches a key event to the device. Supports named keys (BACK, HOME, RECENTS/APP_SWITCH, ENTER, ' +
        'LOCK/POWER, VOLUP, VOLDOWN, TAB, DELETE/BACKSPACE, ESCAPE, CAMERA, MENU, SEARCH, UP, DOWN, LEFT, RIGHT, CENTER) ' +
        'or direct Android integer keycodes.',
      inputSchema: {
        key: z
          .union([z.string(), z.number()])
          .describe('Key name (e.g. "BACK", "HOME", "ENTER", "RECENTS", "LOCK") or integer keycode.'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('press_key', async ({ key, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await pressKey(target.adb.runner, dev, key);
      return jsonResult({ pressedKey: res.key, keyCode: res.keyCode, device: dev });
    })
  );

  server.registerTool(
    'swipe_screen',
    {
      title: 'Swipe or scroll screen',
      description:
        'Performs a swipe gesture across the screen. Specify either a high-level direction ("up", "down", "left", "right") ' +
        'or explicit start and end (x, y) pixel coordinates.',
      inputSchema: {
        direction: z
          .enum(['up', 'down', 'left', 'right'])
          .optional()
          .describe('High-level swipe direction: "up" scrolls down, "down" scrolls up, "left" scrolls right, "right" scrolls left.'),
        startX: z.number().optional().describe('Start X pixel coordinate.'),
        startY: z.number().optional().describe('Start Y pixel coordinate.'),
        endX: z.number().optional().describe('End X pixel coordinate.'),
        endY: z.number().optional().describe('End Y pixel coordinate.'),
        durationMs: z
          .number()
          .optional()
          .default(300)
          .describe('Swipe duration in milliseconds (default 300ms).'),
        device: z
          .string()
          .optional()
          .describe('Device id. Defaults to sticky target device if not specified.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('swipe_screen', async ({ direction, startX, startY, endX, endY, durationMs, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await swipeScreen(target.adb.runner, dev, {
        direction,
        startX,
        startY,
        endX,
        endY,
        durationMs
      });
      return jsonResult({ swipe: res, device: dev });
    })
  );
}
