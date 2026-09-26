import { AdbError } from './errors';
import { AdbRunner } from './exec';
import { dumpViewHierarchy, findUiNodes, UiNode } from './uiHierarchy';

export const KEY_CODE_MAP: Record<string, number> = {
  HOME: 3,
  BACK: 4,
  CALL: 5,
  ENDCALL: 6,
  DPAD_UP: 19,
  UP: 19,
  DPAD_DOWN: 20,
  DOWN: 20,
  DPAD_LEFT: 21,
  LEFT: 21,
  DPAD_RIGHT: 22,
  RIGHT: 22,
  DPAD_CENTER: 23,
  CENTER: 23,
  VOLUME_UP: 24,
  VOLUP: 24,
  VOLUME_DOWN: 25,
  VOLDOWN: 25,
  POWER: 26,
  LOCK: 26,
  CAMERA: 27,
  CLEAR: 28,
  TAB: 61,
  SPACE: 62,
  ENTER: 66,
  DELETE: 67,
  BACKSPACE: 67,
  MENU: 82,
  SEARCH: 84,
  ESCAPE: 111,
  FORWARD_DEL: 112,
  APP_SWITCH: 187,
  RECENTS: 187
};

/**
 * Resolves a key name or number to an Android keycode.
 */
export function resolveKeyCode(key: string | number): number {
  if (typeof key === 'number') {
    return key;
  }
  const numeric = Number(key);
  if (!isNaN(numeric)) {
    return numeric;
  }
  const normalized = key.trim().toUpperCase();
  const code = KEY_CODE_MAP[normalized];
  if (code !== undefined) {
    return code;
  }
  throw new AdbError(
    'INVALID_KEY',
    `Unknown key name: "${key}".`,
    `Supported key names include: ${Object.keys(KEY_CODE_MAP).slice(0, 10).join(', ')}, etc., or a numeric keycode.`
  );
}

/**
 * Escapes text for `adb shell input text`.
 */
export function escapeInputText(text: string): string {
  // Replace spaces with %s
  // Escape shell-sensitive characters
  return text
    .replace(/\\/g, '\\\\')
    .replace(/ /g, '%s')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/&/g, '\\&')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/;/g, '\\;')
    .replace(/\|/g, '\\|')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\$/g, '\\$')
    .replace(/\*/g, '\\*')
    .replace(/\?/g, '\\?');
}

/**
 * Taps screen at specific (x, y) coordinates.
 */
export async function tapCoordinates(
  runner: AdbRunner,
  deviceId: string,
  x: number,
  y: number
): Promise<{ x: number; y: number }> {
  const roundX = Math.round(x);
  const roundY = Math.round(y);
  await runner.run(deviceId, ['shell', 'input', 'tap', roundX.toString(), roundY.toString()]);
  return { x: roundX, y: roundY };
}

/**
 * Finds a UI element matching criteria in the active view hierarchy and taps its center.
 */
export async function tapElement(
  runner: AdbRunner,
  deviceId: string,
  target: { text?: string; resourceId?: string; contentDesc?: string }
): Promise<{ tapped: boolean; element: UiNode; x: number; y: number }> {
  if (!target.text && !target.resourceId && !target.contentDesc) {
    throw new AdbError(
      'INVALID_ARGUMENT',
      'At least one of text, resourceId, or contentDesc must be provided.',
      'Specify the element text or resource ID to tap.'
    );
  }

  const { nodes } = await dumpViewHierarchy(runner, deviceId);
  const matches = findUiNodes(nodes, target);

  if (matches.length === 0) {
    const desc = Object.entries(target)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${k}="${v}"`)
      .join(', ');
    throw new AdbError(
      'ELEMENT_NOT_FOUND',
      `No UI element found matching (${desc}).`,
      'Dump the view hierarchy with dump_view_hierarchy to inspect the current screen layout.'
    );
  }

  // Pick the best match: prioritize clickable nodes and exact matches
  const sorted = [...matches].sort((a, b) => {
    if (a.clickable && !b.clickable) return -1;
    if (!a.clickable && b.clickable) return 1;
    // Prioritize visible area > 0
    if (a.bounds.width * a.bounds.height > 0 && b.bounds.width * b.bounds.height === 0) return -1;
    if (a.bounds.width * a.bounds.height === 0 && b.bounds.width * b.bounds.height > 0) return 1;
    return 0;
  });

  const bestMatch = sorted[0];
  const { centerX, centerY } = bestMatch.bounds;

  await tapCoordinates(runner, deviceId, centerX, centerY);
  return {
    tapped: true,
    element: bestMatch,
    x: centerX,
    y: centerY
  };
}

/**
 * Types text into the currently focused input field.
 */
export async function inputText(
  runner: AdbRunner,
  deviceId: string,
  text: string
): Promise<{ text: string }> {
  if (!text) {
    return { text: '' };
  }
  const escaped = escapeInputText(text);
  await runner.run(deviceId, ['shell', 'input', 'text', escaped]);
  return { text };
}

/**
 * Dispatches a hardware or navigation key event (e.g. BACK, HOME, ENTER).
 */
export async function pressKey(
  runner: AdbRunner,
  deviceId: string,
  key: string | number
): Promise<{ key: string | number; keyCode: number }> {
  const keyCode = resolveKeyCode(key);
  await runner.run(deviceId, ['shell', 'input', 'keyevent', keyCode.toString()]);
  return { key, keyCode };
}

export interface SwipeOptions {
  direction?: 'up' | 'down' | 'left' | 'right';
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  durationMs?: number;
}

/**
 * Parses screen size from `wm size` output.
 */
function parseScreenSize(wmSizeOutput: string): { width: number; height: number } {
  const overrideMatch = /Override size:\s*(\d+)x(\d+)/.exec(wmSizeOutput);
  if (overrideMatch) {
    return { width: parseInt(overrideMatch[1], 10), height: parseInt(overrideMatch[2], 10) };
  }
  const physicalMatch = /Physical size:\s*(\d+)x(\d+)/.exec(wmSizeOutput);
  if (physicalMatch) {
    return { width: parseInt(physicalMatch[1], 10), height: parseInt(physicalMatch[2], 10) };
  }
  return { width: 1080, height: 2400 };
}

/**
 * Swipes on screen by coordinates or direction.
 */
export async function swipeScreen(
  runner: AdbRunner,
  deviceId: string,
  options: SwipeOptions
): Promise<{ startX: number; startY: number; endX: number; endY: number; durationMs: number }> {
  let { startX, startY, endX, endY } = options;
  const durationMs = options.durationMs ?? 300;

  if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
    if (!options.direction) {
      throw new AdbError(
        'INVALID_ARGUMENT',
        'Either swipe direction ("up", "down", "left", "right") or start/end coordinates must be provided.',
        'Provide direction or startX, startY, endX, endY.'
      );
    }

    const wmOutput = await runner.run(deviceId, ['shell', 'wm', 'size']).catch(() => '');
    const { width, height } = parseScreenSize(wmOutput);

    switch (options.direction) {
      case 'up':
        // Swipe upwards (scrolls content down)
        startX = Math.round(width * 0.5);
        startY = Math.round(height * 0.75);
        endX = Math.round(width * 0.5);
        endY = Math.round(height * 0.25);
        break;
      case 'down':
        // Swipe downwards (scrolls content up)
        startX = Math.round(width * 0.5);
        startY = Math.round(height * 0.25);
        endX = Math.round(width * 0.5);
        endY = Math.round(height * 0.75);
        break;
      case 'left':
        // Swipe left (scrolls content right)
        startX = Math.round(width * 0.85);
        startY = Math.round(height * 0.5);
        endX = Math.round(width * 0.15);
        endY = Math.round(height * 0.5);
        break;
      case 'right':
        // Swipe right (scrolls content left)
        startX = Math.round(width * 0.15);
        startY = Math.round(height * 0.5);
        endX = Math.round(width * 0.85);
        endY = Math.round(height * 0.5);
        break;
    }
  }

  await runner.run(deviceId, [
    'shell',
    'input',
    'swipe',
    startX.toString(),
    startY.toString(),
    endX.toString(),
    endY.toString(),
    durationMs.toString()
  ]);

  return { startX, startY, endX, endY, durationMs };
}
