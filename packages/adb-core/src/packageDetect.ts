import * as fs from 'fs';
import * as path from 'path';

/**
 * Finds an Android applicationId by scanning a workspace.
 *
 * Used by the IDE surfaces for their "Auto Detect" button and by the MCP server to derive a
 * default package from the client's roots, so agents rarely have to pass one.
 */

const MAX_DEPTH = 4;
const SKIP_DIRS = new Set(['node_modules', 'build', 'out', 'dist', '.gradle', '.idea']);

export function autoDetectPackage(rootPaths: string[]): string | null {
  for (const rootPath of rootPaths) {
    const found = scanDir(rootPath, 0);
    if (found) {
      return found;
    }
  }
  return null;
}

function scanDir(dir: string, depth: number): string | null {
  if (depth > MAX_DEPTH) {
    return null;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  // Files first: a build script at this level beats one nested deeper.
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const found = readPackageFromFile(path.join(dir, entry.name), entry.name);
    if (found) {
      return found;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const found = scanDir(path.join(dir, entry.name), depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

function readPackageFromFile(fullPath: string, name: string): string | null {
  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }

  if (name === 'AndroidManifest.xml') {
    return content.match(/package="([^"]+)"/)?.[1] ?? null;
  }
  if (name === 'build.gradle' || name === 'build.gradle.kts') {
    return (
      content.match(/applicationId\s*=?\s*["']([^"']+)["']/)?.[1] ??
      content.match(/namespace\s*=?\s*["']([^"']+)["']/)?.[1] ??
      null
    );
  }
  return null;
}
