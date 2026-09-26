import { AdbRunner } from './exec';

export interface UiNodeBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface UiNode {
  index?: number;
  text?: string;
  resourceId?: string;
  className?: string;
  packageName?: string;
  contentDesc?: string;
  checkable?: boolean;
  checked?: boolean;
  clickable?: boolean;
  enabled?: boolean;
  focusable?: boolean;
  focused?: boolean;
  scrollable?: boolean;
  longClickable?: boolean;
  password?: boolean;
  selected?: boolean;
  bounds: UiNodeBounds;
  children?: UiNode[];
}

export interface UiHierarchyResult {
  root: UiNode | null;
  nodes: UiNode[];
  totalNodes: number;
}

export interface ParseOptions {
  compressed?: boolean;
}

const BOUNDS_REGEX = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
const ATTR_REGEX = /([\w:-]+)="([^"]*)"/g;

/**
 * Parses XML bounds string `[left,top][right,bottom]` into coordinates and dimensions.
 */
export function parseBounds(boundsStr: string): UiNodeBounds {
  const match = BOUNDS_REGEX.exec(boundsStr);
  if (!match) {
    return { left: 0, top: 0, right: 0, bottom: 0, centerX: 0, centerY: 0, width: 0, height: 0 };
  }
  const left = parseInt(match[1], 10);
  const top = parseInt(match[2], 10);
  const right = parseInt(match[3], 10);
  const bottom = parseInt(match[4], 10);
  return {
    left,
    top,
    right,
    bottom,
    centerX: Math.round((left + right) / 2),
    centerY: Math.round((top + bottom) / 2),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

/**
 * Parses raw UIAutomator XML string into a structured node tree and list.
 */
export function parseUiHierarchyXml(xml: string, options: ParseOptions = {}): UiHierarchyResult {
  if (!xml || !xml.includes('<node')) {
    return { root: null, nodes: [], totalNodes: 0 };
  }

  const allNodes: UiNode[] = [];
  const stack: UiNode[] = [];
  let rootNode: UiNode | null = null;

  // Match opening tags, self-closing tags, or closing tags
  const tagRegex = /<node\s+([^>]*?)(\/?)>|<\/node>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const fullMatch = match[0];
    if (fullMatch === '</node>') {
      stack.pop();
      continue;
    }

    const attrString = match[1];
    const isSelfClosing = match[2] === '/';

    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;
    ATTR_REGEX.lastIndex = 0;
    while ((attrMatch = ATTR_REGEX.exec(attrString)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }

    const node: UiNode = {
      index: attrs['index'] !== undefined ? parseInt(attrs['index'], 10) : undefined,
      text: attrs['text'] || undefined,
      resourceId: attrs['resource-id'] || undefined,
      className: attrs['class'] || undefined,
      packageName: attrs['package'] || undefined,
      contentDesc: attrs['content-desc'] || undefined,
      checkable: attrs['checkable'] === 'true',
      checked: attrs['checked'] === 'true',
      clickable: attrs['clickable'] === 'true',
      enabled: attrs['enabled'] === 'true',
      focusable: attrs['focusable'] === 'true',
      focused: attrs['focused'] === 'true',
      scrollable: attrs['scrollable'] === 'true',
      longClickable: attrs['long-clickable'] === 'true',
      password: attrs['password'] === 'true',
      selected: attrs['selected'] === 'true',
      bounds: parseBounds(attrs['bounds'] || ''),
      children: []
    };

    if (stack.length === 0) {
      rootNode = node;
    } else {
      const parent = stack[stack.length - 1];
      parent.children = parent.children || [];
      parent.children.push(node);
    }

    allNodes.push(node);

    if (!isSelfClosing) {
      stack.push(node);
    }
  }

  const isInformative = (n: UiNode): boolean => {
    return Boolean(
      n.text ||
      n.contentDesc ||
      n.resourceId ||
      n.clickable ||
      n.checkable ||
      n.scrollable ||
      n.longClickable ||
      n.focusable
    );
  };

  const filteredNodes = options.compressed ? allNodes.filter(isInformative) : allNodes;

  return {
    root: rootNode,
    nodes: filteredNodes,
    totalNodes: allNodes.length
  };
}

/**
 * Runs uiautomator dump on the device and returns the raw XML.
 */
export async function dumpViewHierarchyXml(runner: AdbRunner, deviceId: string): Promise<string> {
  const dumpPath = '/data/local/tmp/uidump.xml';
  await runner.run(deviceId, ['shell', 'uiautomator', 'dump', dumpPath]);
  const xml = await runner.run(deviceId, ['shell', 'cat', dumpPath]);
  // Clean up asynchronously / silently
  runner.run(deviceId, ['shell', 'rm', '-f', dumpPath]).catch(() => undefined);
  return xml;
}

/**
 * Dumps view hierarchy from the device and parses into structured JSON.
 */
export async function dumpViewHierarchy(
  runner: AdbRunner,
  deviceId: string,
  options: ParseOptions = {}
): Promise<UiHierarchyResult> {
  const xml = await dumpViewHierarchyXml(runner, deviceId);
  return parseUiHierarchyXml(xml, options);
}

/**
 * Searches UI nodes by text, resource-id, or content-desc.
 */
export function findUiNodes(
  nodes: UiNode[],
  query: { text?: string; resourceId?: string; contentDesc?: string; clickableOnly?: boolean }
): UiNode[] {
  return nodes.filter(node => {
    if (query.clickableOnly && !node.clickable) {
      return false;
    }
    if (query.text) {
      const target = query.text.toLowerCase();
      const nodeText = (node.text || '').toLowerCase();
      if (!nodeText.includes(target)) {
        return false;
      }
    }
    if (query.resourceId) {
      const target = query.resourceId.toLowerCase();
      const nodeRes = (node.resourceId || '').toLowerCase();
      if (!nodeRes.includes(target) && !nodeRes.endsWith(target)) {
        return false;
      }
    }
    if (query.contentDesc) {
      const target = query.contentDesc.toLowerCase();
      const nodeDesc = (node.contentDesc || '').toLowerCase();
      if (!nodeDesc.includes(target)) {
        return false;
      }
    }
    return true;
  });
}
