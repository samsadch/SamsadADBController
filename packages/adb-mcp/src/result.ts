import { AdbError, normalizeAdbError } from '@samsadch/adb-core';

/**
 * Tool result shaping.
 *
 * Failures are returned as `isError` results rather than thrown, so the agent sees the reason
 * and the suggested next step and can recover without the whole call being dropped.
 */

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
  [key: string]: unknown;
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function jsonResult(value: unknown): ToolResult {
  return textResult(JSON.stringify(value, null, 2));
}

export function imageResult(dataBase64: string, mimeType = 'image/png', caption?: string): ToolResult {
  const content: ToolContent[] = [{ type: 'image', data: dataBase64, mimeType }];
  if (caption) {
    content.push({ type: 'text', text: caption });
  }
  return { content };
}

export function errorResult(err: unknown, context?: string): ToolResult {
  const normalized: AdbError = normalizeAdbError(err, context);
  return {
    content: [{ type: 'text', text: normalized.toDisplayString() }],
    isError: true
  };
}

/** Wraps a tool handler so every unexpected throw becomes a normalized error result. */
export function guard<A>(
  context: string,
  handler: (args: A) => Promise<ToolResult>
): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (err) {
      return errorResult(err, context);
    }
  };
}
