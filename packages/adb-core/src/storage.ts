import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AdbRunner } from './exec';
import { TRANSFER_TIMEOUT_MS } from './types';

/** SharedPreferences access and whole-app data export. */

const PREFS_DIR = (pkg: string) => `/data/data/${pkg}/shared_prefs/`;

export type PrefType = 'string' | 'boolean' | 'int' | 'long' | 'float' | 'set';

export interface PrefEntry {
  key: string;
  type: PrefType;
  value: string | boolean | number | string[];
}

/**
 * Rejects names that could break out of the quoting in a device-shell command.
 * Anything interpolated into a `run-as … sh -c '…'` string must pass this first.
 */
function assertSafeName(...parts: string[]): void {
  for (const part of parts) {
    if (!/^[A-Za-z0-9._-]+$/.test(part)) {
      throw new Error(`Unsupported name for a device path: '${part}'`);
    }
  }
}

function escapeXmlText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Parses raw SharedPreferences XML into typed key-value entries.
 */
export function parseSharedPreferencesXml(xml: string): Record<string, PrefEntry> {
  const result: Record<string, PrefEntry> = {};
  if (!xml || !xml.includes('<map')) {
    return result;
  }

  // 1. Strings: <string name="key">value</string> or <string name="key" />
  const stringRegex = /<string\s+name="([^"]*)"(?:\s*\/>|>([\s\S]*?)<\/string>)/g;
  let match: RegExpExecArray | null;
  while ((match = stringRegex.exec(xml)) !== null) {
    const key = unescapeXml(match[1]);
    const val = match[2] !== undefined ? unescapeXml(match[2]) : '';
    result[key] = { key, type: 'string', value: val };
  }

  // 2. Booleans: <boolean name="key" value="true" />
  const boolRegex = /<boolean\s+name="([^"]*)"\s+value="([^"]*)"\s*\/>/g;
  while ((match = boolRegex.exec(xml)) !== null) {
    const key = unescapeXml(match[1]);
    result[key] = { key, type: 'boolean', value: match[2] === 'true' };
  }

  // 3. Ints: <int name="key" value="42" />
  const intRegex = /<int\s+name="([^"]*)"\s+value="([^"]*)"\s*\/>/g;
  while ((match = intRegex.exec(xml)) !== null) {
    const key = unescapeXml(match[1]);
    result[key] = { key, type: 'int', value: parseInt(match[2], 10) || 0 };
  }

  // 4. Longs: <long name="key" value="1234567890" />
  const longRegex = /<long\s+name="([^"]*)"\s+value="([^"]*)"\s*\/>/g;
  while ((match = longRegex.exec(xml)) !== null) {
    const key = unescapeXml(match[1]);
    result[key] = { key, type: 'long', value: match[2] };
  }

  // 5. Floats: <float name="key" value="3.14" />
  const floatRegex = /<float\s+name="([^"]*)"\s+value="([^"]*)"\s*\/>/g;
  while ((match = floatRegex.exec(xml)) !== null) {
    const key = unescapeXml(match[1]);
    result[key] = { key, type: 'float', value: parseFloat(match[2]) || 0 };
  }

  // 6. Sets: <set name="key"><string>a</string><string>b</string></set>
  const setRegex = /<set\s+name="([^"]*)">([\s\S]*?)<\/set>/g;
  while ((match = setRegex.exec(xml)) !== null) {
    const key = unescapeXml(match[1]);
    const inner = match[2];
    const itemRegex = /<string>(.*?)<\/string>/g;
    const items: string[] = [];
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(inner)) !== null) {
      items.push(unescapeXml(itemMatch[1]));
    }
    result[key] = { key, type: 'set', value: items };
  }

  return result;
}

/**
 * Serializes typed preferences entries into standard Android SharedPreferences XML.
 */
export function serializeSharedPreferencesXml(entries: Record<string, PrefEntry>): string {
  let xml = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n";
  for (const [key, entry] of Object.entries(entries)) {
    const escapedKey = escapeXmlAttr(key);
    switch (entry.type) {
      case 'string':
        xml += `    <string name="${escapedKey}">${escapeXmlText(String(entry.value))}</string>\n`;
        break;
      case 'boolean':
        xml += `    <boolean name="${escapedKey}" value="${Boolean(entry.value)}" />\n`;
        break;
      case 'int':
        xml += `    <int name="${escapedKey}" value="${parseInt(String(entry.value), 10) || 0}" />\n`;
        break;
      case 'long':
        xml += `    <long name="${escapedKey}" value="${entry.value}" />\n`;
        break;
      case 'float':
        xml += `    <float name="${escapedKey}" value="${parseFloat(String(entry.value)) || 0}" />\n`;
        break;
      case 'set':
        xml += `    <set name="${escapedKey}">\n`;
        const items = Array.isArray(entry.value) ? entry.value : [String(entry.value)];
        for (const item of items) {
          xml += `        <string>${escapeXmlText(String(item))}</string>\n`;
        }
        xml += `    </set>\n`;
        break;
    }
  }
  xml += "</map>\n";
  return xml;
}

export async function getSharedPrefsFiles(
  runner: AdbRunner, deviceId: string, pkg: string
): Promise<string[]> {
  try {
    const output = await runner.runAdb(deviceId, 'shell', 'run-as', pkg, 'ls', PREFS_DIR(pkg));
    return output.split('\n').map(f => f.trim()).filter(f => f.endsWith('.xml')).sort();
  } catch {
    return [];
  }
}

export function readSharedPrefsXml(
  runner: AdbRunner, deviceId: string, pkg: string, fileName: string
): Promise<string> {
  const safeFile = fileName.endsWith('.xml') ? fileName : `${fileName}.xml`;
  return runner.runAdb(deviceId, 'shell', 'run-as', pkg, 'cat', `${PREFS_DIR(pkg)}${safeFile}`);
}

export async function writeSharedPrefsXml(
  runner: AdbRunner, deviceId: string, pkg: string, fileName: string, xmlContent: string
): Promise<string> {
  const safeFile = fileName.endsWith('.xml') ? fileName : `${fileName}.xml`;
  assertSafeName(pkg, safeFile);
  const remote = `${PREFS_DIR(pkg)}${safeFile}`;
  const base64 = Buffer.from(xmlContent, 'utf8').toString('base64');

  await runner.run(deviceId, [
    'shell',
    `run-as ${pkg} sh -c 'echo "${base64}" | base64 -d > "${remote}"'`
  ]);

  return `Saved ${safeFile} successfully`;
}

/**
 * Reads all parsed preferences from an XML file.
 */
export async function readAllSharedPreferences(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  fileName: string
): Promise<{ fileName: string; entries: Record<string, PrefEntry>; list: PrefEntry[] }> {
  const xml = await readSharedPrefsXml(runner, deviceId, pkg, fileName);
  const entries = parseSharedPreferencesXml(xml);
  return {
    fileName: fileName.endsWith('.xml') ? fileName : `${fileName}.xml`,
    entries,
    list: Object.values(entries)
  };
}

/**
 * Gets a single preference key's value and type.
 */
export async function getSharedPreferenceValue(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  fileName: string,
  key: string
): Promise<PrefEntry | null> {
  const { entries } = await readAllSharedPreferences(runner, deviceId, pkg, fileName);
  return entries[key] || null;
}

/**
 * Infers preference data type from a value if not provided explicitly.
 */
export function inferPrefType(value: unknown): PrefType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int' : 'float';
  }
  if (Array.isArray(value)) return 'set';
  return 'string';
}

/**
 * Sets or updates a preference key-value pair.
 */
export async function setSharedPreferenceValue(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  fileName: string,
  key: string,
  value: string | boolean | number | string[],
  type?: PrefType
): Promise<PrefEntry> {
  const resolvedType = type || inferPrefType(value);
  let resolvedValue = value;

  if (resolvedType === 'int') {
    resolvedValue = parseInt(String(value), 10) || 0;
  } else if (resolvedType === 'float') {
    resolvedValue = parseFloat(String(value)) || 0;
  } else if (resolvedType === 'boolean') {
    resolvedValue = String(value) === 'true' || value === true;
  } else if (resolvedType === 'set') {
    resolvedValue = Array.isArray(value) ? value.map(String) : [String(value)];
  } else {
    resolvedValue = String(value);
  }

  let entries: Record<string, PrefEntry> = {};
  try {
    const xml = await readSharedPrefsXml(runner, deviceId, pkg, fileName);
    entries = parseSharedPreferencesXml(xml);
  } catch {
    // File may not exist yet, we will create it
  }

  const entry: PrefEntry = { key, type: resolvedType, value: resolvedValue };
  entries[key] = entry;

  const newXml = serializeSharedPreferencesXml(entries);
  await writeSharedPrefsXml(runner, deviceId, pkg, fileName, newXml);
  return entry;
}

/**
 * Deletes a preference key.
 */
export async function deleteSharedPreferenceValue(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  fileName: string,
  key: string
): Promise<{ deleted: boolean; key: string }> {
  const xml = await readSharedPrefsXml(runner, deviceId, pkg, fileName);
  const entries = parseSharedPreferencesXml(xml);

  if (!entries[key]) {
    return { deleted: false, key };
  }

  delete entries[key];
  const newXml = serializeSharedPreferencesXml(entries);
  await writeSharedPrefsXml(runner, deviceId, pkg, fileName, newXml);
  return { deleted: true, key };
}

/**
 * Clears all preferences in a file.
 */
export async function clearSharedPreferencesFile(
  runner: AdbRunner,
  deviceId: string,
  pkg: string,
  fileName: string
): Promise<string> {
  const emptyXml = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n</map>\n";
  return await writeSharedPrefsXml(runner, deviceId, pkg, fileName, emptyXml);
}

export async function dumpSharedPreferences(
  runner: AdbRunner, deviceId: string, pkg: string
): Promise<string> {
  const files = await getSharedPrefsFiles(runner, deviceId, pkg);
  if (files.length === 0) {
    return `No SharedPreferences XML files found in ${PREFS_DIR(pkg)}`;
  }
  const sections: string[] = [];
  for (const file of files) {
    const content = await readSharedPrefsXml(runner, deviceId, pkg, file)
      .catch(() => '(empty or unreadable)');
    sections.push(`=== SharedPreferences: ${file} ===\n${content}`);
  }
  return sections.join('\n\n');
}

/** Lists the app's SQLite databases, hiding the WAL/SHM/journal sidecars. */
export async function getDatabaseFiles(
  runner: AdbRunner, deviceId: string, pkg: string
): Promise<string[]> {
  try {
    const output = await runner.runAdb(
      deviceId, 'shell', 'run-as', pkg, 'ls', `/data/data/${pkg}/databases/`
    );
    return output
      .split('\n')
      .map(l => l.trim())
      .filter(f =>
        f && !f.endsWith('-wal') && !f.endsWith('-shm') &&
        !f.endsWith('-journal') && !f.includes('No such file')
      )
      .sort();
  } catch {
    return [];
  }
}

/** Pulls SharedPreferences and databases into `<projectRoot>/.adb_exports/<pkg>/`. */
export async function exportAppData(
  runner: AdbRunner, deviceId: string, pkg: string, projectRoot: string
): Promise<string> {
  const exportDir = path.join(projectRoot, '.adb_exports', pkg);
  fs.mkdirSync(exportDir, { recursive: true });
  let count = 0;

  try {
    const files = await getSharedPrefsFiles(runner, deviceId, pkg);
    if (files.length > 0) {
      const prefsDir = path.join(exportDir, 'shared_prefs');
      fs.mkdirSync(prefsDir, { recursive: true });
      for (const file of files) {
        const xml = await readSharedPrefsXml(runner, deviceId, pkg, file);
        fs.writeFileSync(path.join(prefsDir, file), xml);
        count++;
      }
    }
  } catch { /* prefs may not exist; databases are still worth trying */ }

  try {
    const dbList = await runner.runAdb(
      deviceId, 'shell', 'run-as', pkg, 'ls', `/data/data/${pkg}/databases/`
    );
    const files = dbList.split('\n').map(f => f.trim()).filter(f => f && !f.includes('No such file'));
    if (files.length > 0) {
      const dbDir = path.join(exportDir, 'databases');
      fs.mkdirSync(dbDir, { recursive: true });
      for (const file of files) {
        const targetFile = path.join(dbDir, file);
        const buffer = await runner.runBinary(deviceId, [
          'exec-out', 'run-as', pkg, 'cat', `/data/data/${pkg}/databases/${file}`
        ]);
        if (buffer && buffer.length > 0) {
          await fs.promises.writeFile(targetFile, buffer);
          count++;
        }
      }
    }
  } catch { /* databases may not exist or run-as may be denied */ }

  if (count === 0) {
    throw new Error('No data found or app is not debuggable (run-as not permitted).');
  }
  return `Exported ${count} file(s) to .adb_exports/${pkg}`;
}
