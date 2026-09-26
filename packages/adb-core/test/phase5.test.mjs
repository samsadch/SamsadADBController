import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  pushFile,
  pullFile,
  executeShellCommand
} from '../out/index.js';

test('pushFile validates local file existence and executes adb push', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-core-test-'));
  const testFile = path.join(tmpDir, 'sample.txt');
  fs.writeFileSync(testFile, 'hello android');

  const recorded = [];
  const fakeRunner = {
    run: async (dev, args, opts) => {
      recorded.push({ dev, args, opts });
      return '1 file pushed, 0 skipped. 0.0 MB/s';
    }
  };

  const res = await pushFile(fakeRunner, 'device-1', testFile, '/sdcard/sample.txt');
  assert.ok(res.includes('pushed'));
  assert.equal(recorded[0].dev, 'device-1');
  assert.deepEqual(recorded[0].args, ['push', testFile, '/sdcard/sample.txt']);

  await assert.rejects(async () => {
    await pushFile(fakeRunner, 'device-1', '/non/existent/path/never_here.txt', '/sdcard/foo.txt');
  }, /Local file or directory does not exist/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('pullFile creates destination directory if needed and executes adb pull', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-core-pull-test-'));
  const targetFile = path.join(tmpDir, 'nested', 'dir', 'downloaded.txt');

  const recorded = [];
  const fakeRunner = {
    run: async (dev, args, opts) => {
      recorded.push({ dev, args, opts });
      return '1 file pulled, 0 skipped.';
    }
  };

  const res = await pullFile(fakeRunner, 'device-1', '/sdcard/remote.txt', targetFile);
  assert.ok(res.includes('pulled'));
  assert.ok(fs.existsSync(path.dirname(targetFile)));
  assert.deepEqual(recorded[0].args, ['pull', '/sdcard/remote.txt', targetFile]);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('executeShellCommand executes adb shell and returns structured result', async () => {
  const recorded = [];
  const fakeRunner = {
    run: async (dev, args, opts) => {
      recorded.push({ dev, args, opts });
      return 'Linux localhost 5.10.0-android12-9 #1 SMP PREEMPT';
    }
  };

  const res = await executeShellCommand(fakeRunner, 'device-1', 'uname -a');
  assert.equal(res.device, 'device-1');
  assert.equal(res.command, 'uname -a');
  assert.ok(res.output.includes('Linux localhost'));
  assert.deepEqual(recorded[0].args, ['shell', 'uname -a']);

  await assert.rejects(async () => {
    await executeShellCommand(fakeRunner, 'device-1', '   ');
  }, /Command cannot be empty/);
});
