import { AdbRunner } from './exec';
import { dumpViewHierarchy, findUiNodes, type UiNode } from './uiHierarchy';
import { tapCoordinates } from './input';

export interface SelectorOptions {
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  className?: string;
  exact?: boolean;
}

export interface TapSelectorResult {
  tapped: boolean;
  x: number;
  y: number;
  node?: UiNode;
  message: string;
}

export interface AssertUiResult {
  found: boolean;
  matchCount: number;
  matchingNodes: UiNode[];
}

/**
 * Searches the current UI hierarchy for a matching element, calculates its center coordinates,
 * and performs an ADB touch tap.
 */
export async function tapBySelector(
  runner: AdbRunner,
  deviceId: string,
  selector: SelectorOptions
): Promise<TapSelectorResult> {
  const hierarchy = await dumpViewHierarchy(runner, deviceId, { compressed: false });
  const nodes = hierarchy.nodes;
  const matches = findUiNodes(nodes, {
    text: selector.text,
    resourceId: selector.resourceId,
    contentDesc: selector.contentDesc
  });

  if (matches.length === 0) {
    const desc = Object.entries(selector)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${v}"`)
      .join(', ');
    throw new Error(`No UI element found matching selector: ${desc}`);
  }

  const targetNode = matches[0];
  const { centerX, centerY } = targetNode.bounds;

  await tapCoordinates(runner, deviceId, centerX, centerY);

  return {
    tapped: true,
    x: centerX,
    y: centerY,
    node: targetNode,
    message: `Tapped "${targetNode.text || targetNode.resourceId || targetNode.contentDesc || targetNode.className}" at (${centerX}, ${centerY})`
  };
}

/**
 * Asserts whether a UI element matching selector exists in the current view hierarchy.
 */
export async function assertUiElement(
  runner: AdbRunner,
  deviceId: string,
  selector: SelectorOptions
): Promise<AssertUiResult> {
  const hierarchy = await dumpViewHierarchy(runner, deviceId, { compressed: false });
  const nodes = hierarchy.nodes;
  const matches = findUiNodes(nodes, {
    text: selector.text,
    resourceId: selector.resourceId,
    contentDesc: selector.contentDesc
  });

  return {
    found: matches.length > 0,
    matchCount: matches.length,
    matchingNodes: matches
  };
}
