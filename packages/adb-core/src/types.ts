/** Shared value types for the ADB capability layer. */

/** Connection state as reported by `adb devices -l`. */
export type DeviceState = 'device' | 'unauthorized' | 'offline' | 'unknown';

export interface AdbDevice {
  id: string;
  model: string;
  isEmulator: boolean;
  /** Human-readable label used by the IDE surfaces. */
  displayName: string;
  state: DeviceState;
}

/** Everything an agent needs to know about the device it is driving. */
export interface DeviceInfo {
  id: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdkLevel: number;
  abi: string;
  isEmulator: boolean;
  screenSize: string;
  density: string;
  batteryLevel: number | null;
  batteryStatus: string;
  nightMode: boolean;
}

export interface SqlQueryResult {
  columns: string[];
  rows: string[][];
  message?: string;
  isQuery: boolean;
}

/**
 * Host configuration, injected by the embedding surface.
 *
 * The VS Code extension passes values read from its own settings; the MCP server passes
 * environment variables. The core never reaches for `vscode` itself.
 */
export interface AdbConfig {
  /** Explicit path to the adb binary. */
  adbPath?: string;
  /** Android SDK root; `platform-tools/adb` is derived from it. */
  androidSdkPath?: string;
  /** Explicit path to the sqlite3 binary. */
  sqlitePath?: string;
}

export interface RunOptions {
  /** Milliseconds before the adb invocation is killed. Defaults to `DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** Maximum bytes of stdout to buffer. Defaults to 10 MB. */
  maxBuffer?: number;
}

/** Fast commands (`shell input`, `getprop`) finish well inside this. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Pulls, pushes and installs move real bytes and need far longer, especially over Wi-Fi. */
export const TRANSFER_TIMEOUT_MS = 120_000;
