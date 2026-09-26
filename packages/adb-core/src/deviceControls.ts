import { AdbRunner } from './exec';

/** Display toggles, power simulation and input injection. */

export async function isNightMode(runner: AdbRunner, deviceId: string): Promise<boolean> {
  const current = await runner.runAdb(deviceId, 'shell', 'cmd', 'uimode', 'night').catch(() => '');
  return current.toLowerCase().includes('yes');
}

export async function toggleDarkMode(
  runner: AdbRunner,
  deviceId: string,
  mode?: 'light' | 'dark' | 'toggle'
): Promise<string> {
  let target: 'yes' | 'no';
  if (mode === 'dark') {
    target = 'yes';
  } else if (mode === 'light') {
    target = 'no';
  } else {
    target = (await isNightMode(runner, deviceId)) ? 'no' : 'yes';
  }
  await runner.runAdb(deviceId, 'shell', 'cmd', 'uimode', 'night', target);
  return target === 'yes' ? 'Dark Mode set to ON' : 'Dark Mode set to OFF';
}

export async function toggleLayoutBounds(runner: AdbRunner, deviceId: string): Promise<string> {
  const current = await runner.runAdb(deviceId, 'shell', 'getprop', 'debug.layout').catch(() => 'false');
  const newVal = current.trim() === 'true' ? 'false' : 'true';
  await runner.runAdb(deviceId, 'shell', 'setprop', 'debug.layout', newVal);
  // Undocumented SYSPROPS_TRANSACTION code; forces SurfaceFlinger to re-read debug.layout.
  await runner.runAdb(deviceId, 'shell', 'service', 'call', 'activity', '1599295570').catch(() => undefined);
  return `Layout bounds set to ${newVal}`;
}

export async function toggleAnimations(
  runner: AdbRunner,
  deviceId: string,
  enabled?: boolean
): Promise<string> {
  let newScale: string;
  if (enabled === true) {
    newScale = '1.0';
  } else if (enabled === false) {
    newScale = '0.0';
  } else {
    const current = await runner
      .runAdb(deviceId, 'shell', 'settings', 'get', 'global', 'window_animation_scale')
      .catch(() => '1.0');
    newScale = current.trim() === '0' || current.trim() === '0.0' ? '1.0' : '0.0';
  }
  for (const key of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
    await runner.runAdb(deviceId, 'shell', 'settings', 'put', 'global', key, newScale);
  }
  return newScale === '0.0' ? 'Animations OFF (Faster UI)' : 'Animations ON (1.0x)';
}

export async function setBatteryLevel(
  runner: AdbRunner, deviceId: string, level: number
): Promise<string> {
  if (!Number.isFinite(level) || level < 0 || level > 100) {
    throw new Error(`Battery level must be between 0 and 100, got: ${level}`);
  }
  await runner.runAdb(deviceId, 'shell', 'dumpsys', 'battery', 'unplug');
  await runner.runAdb(deviceId, 'shell', 'dumpsys', 'battery', 'set', 'level', String(level));
  return `Battery level set to ${level}%`;
}

export async function unplugBattery(runner: AdbRunner, deviceId: string): Promise<string> {
  await runner.runAdb(deviceId, 'shell', 'dumpsys', 'battery', 'unplug');
  return 'Battery set to Discharging (Unplugged)';
}

export async function resetBattery(runner: AdbRunner, deviceId: string): Promise<string> {
  await runner.runAdb(deviceId, 'shell', 'dumpsys', 'battery', 'reset');
  return 'Battery reset to actual hardware state';
}

export async function forceDozeMode(runner: AdbRunner, deviceId: string): Promise<string> {
  await runner.runAdb(deviceId, 'shell', 'dumpsys', 'deviceidle', 'force-idle');
  return 'Device entered Doze mode (Force Idle)';
}

export async function exitDozeMode(runner: AdbRunner, deviceId: string): Promise<string> {
  await runner.runAdb(deviceId, 'shell', 'dumpsys', 'deviceidle', 'unforce');
  return 'Device exited Doze mode';
}

export async function setAppInactive(
  runner: AdbRunner, deviceId: string, pkg: string
): Promise<string> {
  await runner.runAdb(deviceId, 'shell', 'am', 'set-inactive', pkg, 'true');
  return `${pkg} set to App Standby (Inactive)`;
}

export function sendKeyEvent(runner: AdbRunner, deviceId: string, keyCode: number): Promise<string> {
  // NaN survives the webview hop as null, so reject it here rather than crashing on String().
  if (typeof keyCode !== 'number' || !Number.isFinite(keyCode)) {
    throw new Error(`Invalid key code: ${keyCode}`);
  }
  return runner.runAdb(deviceId, 'shell', 'input', 'keyevent', String(keyCode));
}

export async function sendDeepLink(
  runner: AdbRunner, deviceId: string, url: string, pkg?: string
): Promise<string> {
  const args = ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url];
  if (pkg) {
    args.push(pkg);
  }
  await runner.run(deviceId, args);
  return `Dispatched Deep Link: ${url}`;
}

export interface BroadcastOptions {
  action: string;
  pkg?: string;
  component?: string;
  extras?: Record<string, string | number | boolean>;
}

export async function sendBroadcast(
  runner: AdbRunner,
  deviceId: string,
  actionOrOptions: string | BroadcastOptions,
  extraKey?: string,
  extraVal?: string,
  pkg?: string
): Promise<string> {
  if (typeof actionOrOptions === 'object' && actionOrOptions !== null) {
    const opts = actionOrOptions;
    const args = ['shell', 'am', 'broadcast', '-a', opts.action];
    if (opts.pkg) {
      args.push('-p', opts.pkg);
    }
    if (opts.component) {
      args.push('-n', opts.component);
    }
    if (opts.extras) {
      for (const [key, val] of Object.entries(opts.extras)) {
        if (typeof val === 'boolean') {
          args.push('--ez', key, String(val));
        } else if (typeof val === 'number') {
          if (Number.isInteger(val)) {
            args.push('--ei', key, String(val));
          } else {
            args.push('--ef', key, String(val));
          }
        } else {
          args.push('--es', key, String(val));
        }
      }
    }
    await runner.run(deviceId, args);
    return `Broadcast Sent: ${opts.action}`;
  }

  const args = ['shell', 'am', 'broadcast', '-a', actionOrOptions];
  if (extraKey && extraVal !== undefined) {
    args.push('--es', extraKey, extraVal);
  }
  if (pkg) {
    args.push(pkg);
  }
  await runner.run(deviceId, args);
  return `Broadcast Sent: ${actionOrOptions}`;
}
