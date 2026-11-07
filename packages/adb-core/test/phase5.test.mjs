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

test('listDirectory parses ls -la output into structured file entries', async () => {
  const fakeLsOutput = `total 24
drwxrwx--x 32 root sdcard_rw 4096 2026-09-20 15:42 Download
-rw-rw----  1 u0_a123 u0_a123 124500 2026-09-21 11:20 sample.png
lrwxrwxrwx  1 root root 11 2026-09-20 10:00 sdcard -> /storage/emulated/0
`;

  const fakeRunner = {
    run: async () => fakeLsOutput
  };

  const { listDirectory } = await import('../out/index.js');
  const entries = await listDirectory(fakeRunner, 'device-1', '/sdcard');

  assert.equal(entries.length, 3);
  // Directories first
  assert.equal(entries[0].name, 'Download');
  assert.equal(entries[0].isDirectory, true);
  assert.equal(entries[0].path, '/sdcard/Download');
  assert.equal(entries[0].sizeFormatted, '--');

  const file = entries.find(e => e.name === 'sample.png');
  assert.ok(file);
  assert.equal(file.isDirectory, false);
  assert.equal(file.sizeBytes, 124500);
  assert.equal(file.sizeFormatted, '121.6 KB');

  const link = entries.find(e => e.name === 'sdcard');
  assert.ok(link);
  assert.equal(link.isLink, true);
  assert.equal(link.linkTarget, '/storage/emulated/0');
});

test('createDirectory, deleteDeviceFile, moveDeviceFile execute expected adb commands', async () => {
  const recorded = [];
  const fakeRunner = {
    run: async (dev, args) => {
      recorded.push({ dev, args });
      return '';
    }
  };

  const { createDirectory, deleteDeviceFile, moveDeviceFile } = await import('../out/index.js');

  await createDirectory(fakeRunner, 'dev-1', '/sdcard/NewFolder');
  assert.deepEqual(recorded[0].args, ['shell', 'mkdir -p "/sdcard/NewFolder"']);

  await deleteDeviceFile(fakeRunner, 'dev-1', '/sdcard/old_file.txt');
  assert.deepEqual(recorded[1].args, ['shell', 'rm -rf "/sdcard/old_file.txt"']);

  await moveDeviceFile(fakeRunner, 'dev-1', '/sdcard/a.txt', '/sdcard/b.txt');
  assert.deepEqual(recorded[2].args, ['shell', 'mv "/sdcard/a.txt" "/sdcard/b.txt"']);
});

test('readDeviceFileText heads remote file content without pulling to host', async () => {
  const recorded = [];
  const fakeRunner = {
    run: async (dev, args) => {
      recorded.push({ dev, args });
      return 'line 1\nline 2\nline 3';
    }
  };

  const { readDeviceFileText } = await import('../out/index.js');
  const content = await readDeviceFileText(fakeRunner, 'dev-1', '/sdcard/log.txt', { maxLines: 50 });
  assert.equal(content, 'line 1\nline 2\nline 3');
  assert.deepEqual(recorded[0].args, ['shell', 'head -n 50 "/sdcard/log.txt"']);
});

