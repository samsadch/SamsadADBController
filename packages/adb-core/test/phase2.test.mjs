import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  clearAppData,
  forceStopApp,
  getAppInfo,
  grantPermission,
  installApp,
  listPackages,
  normalizePermissionName,
  restartApp,
  revokePermission,
  startApp,
  uninstallApp
} from '../out/index.js';

function createMockRunner(responses = {}) {
  const calls = [];
  return {
    calls,
    run: async (deviceId, args) => {
      calls.push({ deviceId, args });
      const cmdKey = args.join(' ');
      for (const [pattern, res] of Object.entries(responses)) {
        if (cmdKey.includes(pattern)) {
          return typeof res === 'function' ? res(args) : res;
        }
      }
      return '';
    },
    runAdb: async (deviceId, ...args) => {
      calls.push({ deviceId, args });
      return '';
    }
  };
}

const SAMPLE_DUMPSYS_PACKAGE = `
Activity Resolver Table:
  Schemes:
      https:
        123456 com.example.app/.MainActivity filter 789

Packages:
  Package [com.example.app] (7b8e1f0):
    userId=10234
    versionCode=42 minSdk=24 targetSdk=34
    versionName=2.1.0
    installerPackageName=com.android.vending
    firstInstallTime=2026-01-15 10:20:30
    lastUpdateTime=2026-03-20 14:00:00
    requested permissions:
      android.permission.INTERNET
      android.permission.CAMERA
      android.permission.POST_NOTIFICATIONS
    runtime permissions:
      android.permission.CAMERA: granted=true
      android.permission.POST_NOTIFICATIONS: granted=false
`;

test('normalizePermissionName auto-expands short permission names', () => {
  assert.equal(normalizePermissionName('CAMERA'), 'android.permission.CAMERA');
  assert.equal(normalizePermissionName('post_notifications'), 'android.permission.POST_NOTIFICATIONS');
  assert.equal(normalizePermissionName('android.permission.INTERNET'), 'android.permission.INTERNET');
  assert.equal(normalizePermissionName('com.custom.PERMISSION'), 'com.custom.PERMISSION');
});

test('installApp validates local file existence and constructs flags', async () => {
  const runner = createMockRunner({ 'install': 'Success' });

  // Missing file check
  await assert.rejects(
    () => installApp(runner, 'dev1', '/non/existent/path/app.apk'),
    err => err.code === 'FILE_NOT_FOUND'
  );

  // Existing file
  const tempDir = mkdtempSync(join(tmpdir(), 'adbmcp-'));
  const tempApk = join(tempDir, 'sample.apk');
  writeFileSync(tempApk, 'FAKE_APK');

  const res = await installApp(runner, 'dev1', tempApk, {
    reinstall: true,
    grantPermissions: true,
    allowDowngrade: true,
    allowTestOnly: true
  });

  assert.equal(res, 'Success');
  const installCall = runner.calls.find(c => c.args[0] === 'install');
  assert.ok(installCall);
  assert.deepEqual(installCall.args, ['install', '-r', '-g', '-d', '-t', tempApk]);
});

test('uninstallApp handles standard and keep-data uninstall', async () => {
  const runner = createMockRunner();

  await uninstallApp(runner, 'dev1', 'com.example.app', false);
  assert.deepEqual(runner.calls[0].args, ['uninstall', 'com.example.app']);

  await uninstallApp(runner, 'dev1', 'com.example.app', true);
  assert.deepEqual(runner.calls[1].args, ['shell', 'pm', 'uninstall', '-k', 'com.example.app']);
});

test('listPackages parses filters and package paths', async () => {
  const runner = createMockRunner({
    'pm list packages -3 -f': [
      'package:/data/app/~~a/com.example.app-1/base.apk=com.example.app',
      'package:/data/app/~~b/org.sample.tool-1/base.apk=org.sample.tool'
    ].join('\n')
  });

  const packages = await listPackages(runner, 'dev1', {
    filter: 'third_party',
    includeApkPath: true,
    query: 'example'
  });

  assert.equal(packages.length, 1);
  assert.equal(packages[0].packageName, 'com.example.app');
  assert.equal(packages[0].apkPath, '/data/app/~~a/com.example.app-1/base.apk');
});

test('startApp launches specific activity or standard launcher', async () => {
  const runner = createMockRunner();

  // Launcher activity
  await startApp(runner, 'dev1', 'com.example.app');
  assert.deepEqual(runner.calls[0].args, [
    'shell', 'monkey', '-p', 'com.example.app', '-c', 'android.intent.category.LAUNCHER', '1'
  ]);

  // Specific Activity with stopFirst
  await startApp(runner, 'dev1', 'com.example.app', {
    activity: '.ui.LoginActivity',
    stopFirst: true
  });
  assert.deepEqual(runner.calls[1].args, ['shell', 'am', 'force-stop', 'com.example.app']);
  assert.deepEqual(runner.calls[2].args, [
    'shell', 'am', 'start', '-n', 'com.example.app/.ui.LoginActivity'
  ]);
});

test('clearAppData clears data and optionally restarts app', async () => {
  const runner = createMockRunner();

  await clearAppData(runner, 'dev1', 'com.example.app', false);
  assert.deepEqual(runner.calls[0].args, ['shell', 'pm', 'clear', 'com.example.app']);

  await clearAppData(runner, 'dev1', 'com.example.app', true);
  assert.deepEqual(runner.calls[1].args, ['shell', 'pm', 'clear', 'com.example.app']);
  assert.deepEqual(runner.calls[2].args, [
    'shell', 'monkey', '-p', 'com.example.app', '-c', 'android.intent.category.LAUNCHER', '1'
  ]);
});

test('grantPermission and revokePermission dispatch pm commands with normalized names', async () => {
  const runner = createMockRunner();

  const grantRes = await grantPermission(runner, 'dev1', 'com.example.app', 'CAMERA');
  assert.equal(grantRes.permission, 'android.permission.CAMERA');
  assert.deepEqual(runner.calls[0].args, ['shell', 'pm', 'grant', 'com.example.app', 'android.permission.CAMERA']);

  const revokeRes = await revokePermission(runner, 'dev1', 'com.example.app', 'CAMERA');
  assert.equal(revokeRes.permission, 'android.permission.CAMERA');
  assert.deepEqual(runner.calls[1].args, ['shell', 'pm', 'revoke', 'com.example.app', 'android.permission.CAMERA']);
});

test('getAppInfo parses dumpsys package metadata', async () => {
  const runner = createMockRunner({
    'dumpsys package': SAMPLE_DUMPSYS_PACKAGE
  });

  const info = await getAppInfo(runner, 'dev1', 'com.example.app');
  assert.equal(info.packageName, 'com.example.app');
  assert.equal(info.versionName, '2.1.0');
  assert.equal(info.versionCode, 42);
  assert.equal(info.minSdk, 24);
  assert.equal(info.targetSdk, 34);
  assert.equal(info.installer, 'com.android.vending');
  assert.equal(info.firstInstallTime, '2026-01-15 10:20:30');
  assert.equal(info.lastUpdateTime, '2026-03-20 14:00:00');
  assert.ok(info.requestedPermissions.includes('android.permission.INTERNET'));
  assert.ok(info.requestedPermissions.includes('android.permission.CAMERA'));
  assert.ok(info.grantedPermissions.includes('android.permission.CAMERA'));
  assert.ok(!info.grantedPermissions.includes('android.permission.POST_NOTIFICATIONS'));
});
