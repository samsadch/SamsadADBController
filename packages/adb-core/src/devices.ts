import { AdbRunner } from './exec';
import { AdbDevice, DeviceInfo, DeviceState } from './types';

/** Device discovery and the device-level facts an agent needs before acting. */

/** Prefix icon and trailing note per connection state, matching the pre-extraction labels. */
function describeState(state: DeviceState, rawState: string): { icon: string; note: string } {
  switch (state) {
    case 'device':
      return { icon: '📱', note: '' };
    case 'unauthorized':
      return { icon: '⚠️', note: ' [Unauthorized - Allow on Phone]' };
    case 'offline':
      return { icon: '🔌', note: ' [Offline]' };
    default:
      return { icon: '📱', note: ` [${rawState}]` };
  }
}

export async function listDevices(
  runner: AdbRunner
): Promise<{ devices: AdbDevice[]; error?: string }> {
  try {
    const output = await runner.runAdb(null, 'devices', '-l');
    const devices: AdbDevice[] = [];

    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('List of devices') || trimmed.startsWith('* daemon')) {
        continue;
      }
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) {
        continue;
      }
      const id = parts[0];
      const rawState = parts[1];
      const state: DeviceState =
        rawState === 'device' || rawState === 'unauthorized' || rawState === 'offline'
          ? rawState
          : 'unknown';

      const modelPart = parts.find(p => p.startsWith('model:'));
      const model = modelPart ? modelPart.replace('model:', '').replace(/_/g, ' ') : id;
      const isEmulator = id.startsWith('emulator-') || trimmed.includes('emulator');
      const type = isEmulator ? 'Emulator' : 'Device';

      const { icon, note } = describeState(state, rawState);
      const modelSuffix = state === 'device' ? '' : ` [${rawState.toUpperCase()}]`;
      devices.push({
        id,
        model: `${model}${modelSuffix}`,
        isEmulator,
        state,
        displayName: `${icon} ${type}: ${model} (${id})${note}`
      });
    }
    return { devices };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ADB execution failed';
    return { devices: [], error: message };
  }
}

/**
 * Collects OS, hardware, display and power state.
 *
 * `getprop` is dumped once and parsed rather than queried key by key, which turns five adb
 * round-trips into one.
 */
export async function getDeviceInfo(runner: AdbRunner, deviceId: string): Promise<DeviceInfo> {
  const [props, size, density, battery, night] = await Promise.all([
    runner.runAdb(deviceId, 'shell', 'getprop').then(parseProps).catch(() => new Map<string, string>()),
    runner.runAdb(deviceId, 'shell', 'wm', 'size').catch(() => ''),
    runner.runAdb(deviceId, 'shell', 'wm', 'density').catch(() => ''),
    runner.runAdb(deviceId, 'shell', 'dumpsys', 'battery').catch(() => ''),
    runner.runAdb(deviceId, 'shell', 'cmd', 'uimode', 'night').catch(() => '')
  ]);

  const model = props.get('ro.product.model') || deviceId;
  const sdkRaw = props.get('ro.build.version.sdk') || '';
  const levelMatch = battery.match(/^\s*level:\s*(\d+)/m);

  return {
    id: deviceId,
    model,
    manufacturer: props.get('ro.product.manufacturer') || 'unknown',
    androidVersion: props.get('ro.build.version.release') || 'unknown',
    sdkLevel: Number.parseInt(sdkRaw, 10) || 0,
    abi: props.get('ro.product.cpu.abi') || 'unknown',
    isEmulator: deviceId.startsWith('emulator-') || props.get('ro.kernel.qemu') === '1',
    // An "Override size" line wins when present: it is what the app actually renders into.
    screenSize: lastMatch(size, /(?:Physical|Override) size:\s*(\S+)/g) || 'unknown',
    density: lastMatch(density, /(?:Physical|Override) density:\s*(\S+)/g) || 'unknown',
    batteryLevel: levelMatch ? Number.parseInt(levelMatch[1], 10) : null,
    batteryStatus: batteryStatusLabel(battery),
    nightMode: /yes/i.test(night)
  };
}

function parseProps(output: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const line of output.split('\n')) {
    const match = line.match(/^\[(.+?)\]:\s*\[(.*)\]$/);
    if (match) {
      props.set(match[1], match[2]);
    }
  }
  return props;
}

function lastMatch(text: string, pattern: RegExp): string | null {
  const matches = [...text.matchAll(pattern)];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
}

const BATTERY_STATUS: Record<string, string> = {
  '1': 'unknown',
  '2': 'charging',
  '3': 'discharging',
  '4': 'not charging',
  '5': 'full'
};

function batteryStatusLabel(dump: string): string {
  const match = dump.match(/^\s*status:\s*(\d+)/m);
  return match ? BATTERY_STATUS[match[1]] || 'unknown' : 'unknown';
}
