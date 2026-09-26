import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  autoDetectPackage,
  getDeviceInfo,
  listDevices,
  normalizeAdbError
} from '../out/index.js';

/** Minimal AdbRunner stand-in: resolves whatever the fixture map says for the joined args. */
function stubRunner(responses) {
  return {
    runAdb: async (_deviceId, ...args) => {
      const key = Object.keys(responses).find(k => args.join(' ').startsWith(k));
      if (key === undefined) {
        throw new Error(`unexpected adb call: ${args.join(' ')}`);
      }
      return responses[key];
    }
  };
}

test('normalizeAdbError maps device-side failures to codes and hints', () => {
  const unauthorized = normalizeAdbError('error: device unauthorized.');
  assert.equal(unauthorized.code, 'DEVICE_UNAUTHORIZED');
  assert.match(unauthorized.hint, /Allow USB debugging/);

  assert.equal(normalizeAdbError('error: device offline').code, 'DEVICE_OFFLINE');
  assert.equal(normalizeAdbError('error: more than one device/emulator').code, 'AMBIGUOUS_DEVICE');
  assert.equal(normalizeAdbError('run-as: package not debuggable').code, 'NOT_DEBUGGABLE');
});

test('normalizeAdbError falls back to COMMAND_FAILED but still carries a hint', () => {
  const err = normalizeAdbError('something nobody has seen before');
  assert.equal(err.code, 'COMMAND_FAILED');
  assert.ok(err.hint.length > 0);
  assert.match(err.toDisplayString(), /^\[COMMAND_FAILED\]/);
});

test('normalizeAdbError passes an existing AdbError through unchanged', () => {
  const first = normalizeAdbError('error: device offline');
  assert.equal(normalizeAdbError(first), first);
});

test('listDevices parses states and skips header and daemon lines', async () => {
  const runner = stubRunner({
    'devices -l': [
      'List of devices attached',
      '* daemon started successfully',
      '43151FDJG0014F  device  product:husky model:Pixel_8_Pro',
      'emulator-5554   device  product:sdk model:sdk_gphone64',
      'RF8M1234ABC     unauthorized',
      '192.168.1.7:5555 offline'
    ].join('\n')
  });

  const { devices, error } = await listDevices(runner);
  assert.equal(error, undefined);
  assert.equal(devices.length, 4);

  const [pixel, emu, unauth, offline] = devices;
  assert.deepEqual(
    { id: pixel.id, model: pixel.model, state: pixel.state, isEmulator: pixel.isEmulator },
    { id: '43151FDJG0014F', model: 'Pixel 8 Pro', state: 'device', isEmulator: false }
  );
  assert.equal(emu.isEmulator, true);
  assert.equal(unauth.state, 'unauthorized');
  assert.match(unauth.displayName, /Allow on Phone/);
  assert.equal(offline.state, 'offline');
  assert.equal(offline.model, '192.168.1.7:5555 [OFFLINE]');
});

test('listDevices reports the failure instead of throwing', async () => {
  const runner = { runAdb: async () => { throw new Error('adb: command not found'); } };
  const { devices, error } = await listDevices(runner);
  assert.deepEqual(devices, []);
  assert.match(error, /command not found/);
});

test('getDeviceInfo parses props, display, battery and night mode', async () => {
  const runner = stubRunner({
    'shell getprop': [
      '[ro.product.model]: [Pixel 8 Pro]',
      '[ro.product.manufacturer]: [Google]',
      '[ro.build.version.release]: [17]',
      '[ro.build.version.sdk]: [37]',
      '[ro.product.cpu.abi]: [arm64-v8a]'
    ].join('\n'),
    'shell wm size': 'Physical size: 1344x2992\nOverride size: 1080x2400',
    'shell wm density': 'Physical density: 480',
    'shell dumpsys battery': '  level: 42\n  status: 3\n  AC powered: false',
    'shell cmd uimode night': 'Night mode: yes'
  });

  const info = await getDeviceInfo(runner, 'dev1');
  assert.equal(info.model, 'Pixel 8 Pro');
  assert.equal(info.sdkLevel, 37);
  assert.equal(info.androidVersion, '17');
  // An Override size is what the app actually renders into, so it wins over Physical.
  assert.equal(info.screenSize, '1080x2400');
  assert.equal(info.density, '480');
  assert.equal(info.batteryLevel, 42);
  assert.equal(info.batteryStatus, 'discharging');
  assert.equal(info.nightMode, true);
});

test('getDeviceInfo degrades to placeholders when the device answers nothing', async () => {
  const runner = { runAdb: async () => { throw new Error('error: device offline'); } };
  const info = await getDeviceInfo(runner, 'dev1');
  assert.equal(info.model, 'dev1');
  assert.equal(info.sdkLevel, 0);
  assert.equal(info.batteryLevel, null);
  assert.equal(info.batteryStatus, 'unknown');
});

test('autoDetectPackage prefers applicationId over namespace', () => {
  const root = mkdtempSync(join(tmpdir(), 'adbcore-'));
  writeFileSync(
    join(root, 'build.gradle.kts'),
    'android {\n  namespace = "com.example.lib"\n  defaultConfig { applicationId = "com.example.app" }\n}\n'
  );
  assert.equal(autoDetectPackage([root]), 'com.example.app');
});

test('autoDetectPackage falls back to AndroidManifest and ignores node_modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'adbcore-'));
  const noise = join(root, 'node_modules', 'pkg');
  mkdirSync(noise, { recursive: true });
  writeFileSync(join(noise, 'AndroidManifest.xml'), '<manifest package="com.should.not.win"/>');

  const app = join(root, 'app', 'src', 'main');
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, 'AndroidManifest.xml'), '<manifest package="com.example.fromManifest"/>');

  assert.equal(autoDetectPackage([root]), 'com.example.fromManifest');
});

test('autoDetectPackage returns null when nothing matches', () => {
  const root = mkdtempSync(join(tmpdir(), 'adbcore-'));
  writeFileSync(join(root, 'README.md'), '# nothing to see');
  assert.equal(autoDetectPackage([root]), null);
});
