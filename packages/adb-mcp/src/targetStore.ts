import { fileURLToPath } from 'node:url';
import { AdbError, AdbExecutor, autoDetectPackage, listDevices } from '@samsadch/adb-core';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * The sticky target.
 *
 * Without this every tool would need a deviceId and a package on every call — two parameters
 * repeated dozens of times a session, and two more chances for the agent to get them wrong.
 * The target is set once (explicitly, or inferred) and every later tool defaults to it.
 */
export class TargetStore {
  private deviceId: string | null = null;
  private packageName: string | null = null;
  private rootsChecked = false;

  constructor(
    public readonly adb: AdbExecutor,
    /** Set once the MCP session is live; used to ask the client for its workspace roots. */
    private server: Server | null = null
  ) {}

  public attachServer(server: Server): void {
    this.server = server;
  }

  public setDevice(deviceId: string): void {
    this.deviceId = deviceId;
  }

  public setPackage(packageName: string): void {
    this.packageName = packageName;
  }

  public snapshot(): { device: string | null; package: string | null } {
    return { device: this.deviceId, package: this.packageName };
  }

  /**
   * Resolves the device to act on.
   *
   * With exactly one device connected the choice is unambiguous, so it is adopted silently
   * rather than forcing a set_target round-trip.
   */
  public async resolveDevice(): Promise<string> {
    if (this.deviceId) {
      return this.deviceId;
    }
    const { devices, error } = await listDevices(this.adb.runner);
    if (error) {
      throw new AdbError('NO_DEVICE', error, 'Check that adb is installed and a device is attached.');
    }
    const online = devices.filter(d => d.state === 'device');

    if (online.length === 0) {
      const blocked = devices.find(d => d.state === 'unauthorized');
      if (blocked) {
        throw new AdbError(
          'DEVICE_UNAUTHORIZED',
          `Device ${blocked.id} has not authorized this computer.`,
          'Unlock the device and accept the "Allow USB debugging" prompt, then retry.'
        );
      }
      throw new AdbError(
        'NO_DEVICE',
        'No online device is connected.',
        'Attach a device or start an emulator, then run list_devices.'
      );
    }
    if (online.length > 1) {
      throw new AdbError(
        'AMBIGUOUS_DEVICE',
        `${online.length} devices are connected and no target is set.`,
        `Call set_target with one of: ${online.map(d => d.id).join(', ')}`
      );
    }
    this.deviceId = online[0].id;
    return this.deviceId;
  }

  /**
   * Resolves the package to act on, falling back to a scan of the client's workspace roots.
   */
  public async resolvePackage(): Promise<string> {
    if (this.packageName) {
      return this.packageName;
    }
    const detected = await this.detectFromRoots();
    if (detected) {
      this.packageName = detected;
      return detected;
    }
    throw new AdbError(
      'PACKAGE_NOT_FOUND',
      'No target package is set and none could be detected from the workspace.',
      'Call set_target with the applicationId, or run list_packages to find it.'
    );
  }

  /** Reads the client's roots once and scans them for an applicationId. */
  public async detectFromRoots(): Promise<string | null> {
    if (this.rootsChecked || !this.server) {
      return null;
    }
    this.rootsChecked = true;
    try {
      const { roots } = await this.server.listRoots();
      const dirs = roots
        .map(root => (root.uri.startsWith('file://') ? safeFileUrlToPath(root.uri) : null))
        .filter((p): p is string => Boolean(p));
      return dirs.length > 0 ? autoDetectPackage(dirs) : null;
    } catch {
      // The client may not support roots at all; that is not an error worth surfacing.
      return null;
    }
  }
}

function safeFileUrlToPath(uri: string): string | null {
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}
