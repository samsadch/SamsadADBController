import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLogcat,
  clearLogcat,
  getAppMemory,
  setBatteryLevel,
  unplugBattery,
  resetBattery,
  forceDozeMode,
  exitDozeMode,
  toggleDarkMode,
  toggleAnimations,
  sendBroadcast
} from '../out/index.js';

const SAMPLE_LOGCAT_OUTPUT = `
--------- beginning of main
09-26 12:00:01.123  1000  1234 I ActivityManager: Start proc 1234:com.example.app/u0a123 for activity
09-26 12:00:02.456  1234  1234 D MyAppTag: Initializing database connection
09-26 12:00:03.789  1234  1234 I MyAppTag: User logged in: user@example.com
09-26 12:00:04.012  1234  1234 W MyAppTag: Network latency high: 450ms
09-26 12:00:05.345  1234  1234 E AndroidRuntime: FATAL EXCEPTION: main
09-26 12:00:05.346  1234  1234 E AndroidRuntime: java.lang.NullPointerException: Null pointer in onClick
`;

const SAMPLE_MEMINFO_OUTPUT = `
Applications Memory Usage (in Kilobytes):
Uptime: 12345 Realtime: 67890

** MEMINFO in pid 1234 [com.example.app] **
                   Pss  Private  Private  SwapPss     Rss
                 Total    Dirty    Clean    Dirty   Total
                ------   ------   ------   ------  ------
  Native Heap    15200    15100        0        0   18400
  Dalvik Heap    25600    25400        0        0   30200
        Stack      512      512        0        0     512
       Cursor        0        0        0        0       0
       Ashmem        0        0        0        0       0
    Other dev       16        0       16        0     300
     .so mmap     4500      200     4000        0    8000
    .jar mmap     1200        0     1000        0    2000
    .apk mmap     3500        0     3000        0    5000
    .ttf mmap      250        0      200        0     400
    .dex mmap     6000       10     5500        0    8000
    .oat mmap      800        0      600        0    1200
    Other mmap      60        4        0        0     200
      GL mmap     8000     8000        0        0    8000
        TOTAL    65638    49226    14316        0   82212
 
 App Summary
                       Pss(KB)                        Rss(KB)
                        ------                         ------
           Java Heap:    25600                          30200
         Native Heap:    15200                          18400
                Code:    16250                          24600
               Stack:      512                            512
            Graphics:     8000                           8000
       Private Other:      264
              System:        0
 
           TOTAL PSS:    65638            TOTAL RSS:    82212       TOTAL SWAP:        0
`;

test('getLogcat runs logcat -d and applies filters', async () => {
  const recorded = [];
  const fakeRunner = {
    run: async (_dev, args) => {
      recorded.push(args);
      if (args[1] === 'pidof') {
        return '1234';
      }
      return SAMPLE_LOGCAT_OUTPUT;
    }
  };

  const res = await getLogcat(fakeRunner, 'device-1', {
    packageName: 'com.example.app',
    tag: 'MyAppTag',
    logLevel: 'W',
    search: 'Network',
    lineLimit: 10
  });

  assert.equal(res.device, 'device-1');
  assert.equal(res.packageName, 'com.example.app');
  assert.equal(res.lines.length, 1);
  assert.ok(res.lines[0].includes('Network latency high'));
});

test('clearLogcat invokes logcat -c', async () => {
  const recorded = [];
  const fakeRunner = {
    run: async (_dev, args) => {
      recorded.push(args);
      return '';
    }
  };

  const res = await clearLogcat(fakeRunner, 'device-1');
  assert.ok(res.includes('cleared'));
  assert.deepEqual(recorded[0], ['shell', 'logcat', '-c']);
});

test('getAppMemory parses dumpsys meminfo correctly into PSS/RSS and subcategories', async () => {
  const fakeRunner = {
    run: async () => SAMPLE_MEMINFO_OUTPUT
  };

  const mem = await getAppMemory(fakeRunner, 'device-1', 'com.example.app');
  assert.equal(mem.packageName, 'com.example.app');
  assert.equal(mem.totalPssKb, 65638);
  assert.equal(mem.totalPssMb, 64.1);
  assert.equal(mem.totalRssKb, 82212);
  assert.equal(mem.totalRssMb, 80.29);
  assert.equal(mem.javaHeapKb, 25600);
  assert.equal(mem.nativeHeapKb, 15200);
  assert.equal(mem.graphicsKb, 8000);
  assert.equal(mem.codeKb, 16250);
  assert.equal(mem.stackKb, 512);
  assert.ok(mem.rawSummary.includes('App Summary'));
});

test('setBatteryLevel, unplugBattery, resetBattery, and Doze commands', async () => {
  const commands = [];
  const fakeRunner = {
    runAdb: async (_dev, ...args) => {
      commands.push(args);
      return '';
    }
  };

  await setBatteryLevel(fakeRunner, 'device-1', 42);
  assert.deepEqual(commands[0], ['shell', 'dumpsys', 'battery', 'unplug']);
  assert.deepEqual(commands[1], ['shell', 'dumpsys', 'battery', 'set', 'level', '42']);

  await assert.rejects(async () => {
    await setBatteryLevel(fakeRunner, 'device-1', 150);
  }, /Battery level must be between 0 and 100/);

  await unplugBattery(fakeRunner, 'device-1');
  assert.deepEqual(commands[2], ['shell', 'dumpsys', 'battery', 'unplug']);

  await resetBattery(fakeRunner, 'device-1');
  assert.deepEqual(commands[3], ['shell', 'dumpsys', 'battery', 'reset']);

  await forceDozeMode(fakeRunner, 'device-1');
  assert.deepEqual(commands[4], ['shell', 'dumpsys', 'deviceidle', 'force-idle']);

  await exitDozeMode(fakeRunner, 'device-1');
  assert.deepEqual(commands[5], ['shell', 'dumpsys', 'deviceidle', 'unforce']);
});

test('toggleDarkMode and toggleAnimations execute correct settings commands', async () => {
  const commands = [];
  const fakeRunner = {
    runAdb: async (_dev, ...args) => {
      commands.push(args);
      if (args[args.length - 1] === 'night') {
        return 'Night mode: yes';
      }
      return '';
    }
  };

  // Explicit dark mode
  await toggleDarkMode(fakeRunner, 'device-1', 'dark');
  assert.deepEqual(commands[0], ['shell', 'cmd', 'uimode', 'night', 'yes']);

  // Explicit light mode
  await toggleDarkMode(fakeRunner, 'device-1', 'light');
  assert.deepEqual(commands[1], ['shell', 'cmd', 'uimode', 'night', 'no']);

  // Toggle animations ON / OFF
  await toggleAnimations(fakeRunner, 'device-1', false);
  assert.deepEqual(commands[2], ['shell', 'settings', 'put', 'global', 'window_animation_scale', '0.0']);
  assert.deepEqual(commands[3], ['shell', 'settings', 'put', 'global', 'transition_animation_scale', '0.0']);
  assert.deepEqual(commands[4], ['shell', 'settings', 'put', 'global', 'animator_duration_scale', '0.0']);
});

test('sendBroadcast formats extras, package, and component correctly', async () => {
  const commands = [];
  const fakeRunner = {
    run: async (_dev, args) => {
      commands.push(args);
      return 'Broadcast completed';
    }
  };

  await sendBroadcast(fakeRunner, 'device-1', {
    action: 'com.example.ACTION_SYNC',
    pkg: 'com.example.app',
    component: 'com.example.app/.SyncReceiver',
    extras: {
      userId: 1234,
      score: 98.5,
      force: true,
      label: 'test'
    }
  });

  assert.deepEqual(commands[0], [
    'shell',
    'am',
    'broadcast',
    '-a',
    'com.example.ACTION_SYNC',
    '-p',
    'com.example.app',
    '-n',
    'com.example.app/.SyncReceiver',
    '--ei',
    'userId',
    '1234',
    '--ef',
    'score',
    '98.5',
    '--ez',
    'force',
    'true',
    '--es',
    'label',
    'test'
  ]);
});
