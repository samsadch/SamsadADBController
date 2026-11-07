import { z } from 'zod';
import {
  createDirectory,
  deleteDeviceFile,
  executeShellCommand,
  listDirectory,
  moveDeviceFile,
  pullFile,
  pushFile,
  readDeviceFileText
} from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers file management, transfer, and ad-hoc shell command execution tools.
 */
export function registerSystemTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'list_directory',
    {
      title: 'List device directory contents',
      description: 'Lists all files and directories at a remote path on the Android device with detailed metadata (type, permissions, size, date).',
      inputSchema: {
        path: z.string().optional().describe('Remote path on the Android device (default: "/sdcard").'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('list_directory', async ({ path, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const entries = await listDirectory(target.adb.runner, dev, path || '/sdcard');
      return jsonResult(entries);
    })
  );

  server.registerTool(
    'read_device_file',
    {
      title: 'Read device file content',
      description: 'Reads text content of a remote file directly on the Android device without downloading it to the host.',
      inputSchema: {
        path: z.string().describe('Remote file path on the Android device (e.g. "/sdcard/Download/config.json", "/data/local/tmp/app.log").'),
        maxLines: z.number().int().positive().optional().describe('Maximum number of lines to read (default: 500).'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('read_device_file', async ({ path, maxLines, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const content = await readDeviceFileText(target.adb.runner, dev, path, { maxLines: maxLines || 500 });
      return textResult(content);
    })
  );

  server.registerTool(
    'create_directory',
    {
      title: 'Create directory on device',
      description: 'Creates a directory path recursively on the Android device filesystem ("mkdir -p").',
      inputSchema: {
        path: z.string().describe('Remote directory path to create on device (e.g. "/sdcard/MyFolder").'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard('create_directory', async ({ path, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await createDirectory(target.adb.runner, dev, path);
      return textResult(msg);
    })
  );

  server.registerTool(
    'delete_file',
    {
      title: 'Delete file or directory on device',
      description: 'Deletes a file or directory recursively on the Android device ("rm -rf").',
      inputSchema: {
        path: z.string().describe('Remote file or directory path to delete.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard('delete_file', async ({ path, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await deleteDeviceFile(target.adb.runner, dev, path);
      return textResult(msg);
    })
  );

  server.registerTool(
    'move_file',
    {
      title: 'Move or rename file on device',
      description: 'Moves or renames a file or directory on the Android device ("mv").',
      inputSchema: {
        sourcePath: z.string().describe('Source path on device.'),
        destPath: z.string().describe('Destination path on device.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('move_file', async ({ sourcePath, destPath, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await moveDeviceFile(target.adb.runner, dev, sourcePath, destPath);
      return textResult(msg);
    })
  );
  server.registerTool(
    'push_file',
    {
      title: 'Push file or directory to device',
      description: 'Transfers a local file or directory from the host machine to a path on the Android device.',
      inputSchema: {
        localPath: z.string().describe('Absolute or relative path to the source file/directory on the host machine.'),
        remotePath: z.string().describe('Destination path on the Android device (e.g. "/sdcard/Download/file.txt" or "/data/local/tmp/").'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('push_file', async ({ localPath, remotePath, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await pushFile(target.adb.runner, dev, localPath, remotePath);
      return textResult(msg);
    })
  );

  server.registerTool(
    'pull_file',
    {
      title: 'Pull file or directory from device',
      description: 'Transfers a file or directory from the Android device to the host machine filesystem.',
      inputSchema: {
        remotePath: z.string().describe('Source path on the Android device (e.g. "/sdcard/Download/test.txt" or "/data/local/tmp/app.log").'),
        localPath: z.string().describe('Destination file or directory path on the host machine.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('pull_file', async ({ remotePath, localPath, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await pullFile(target.adb.runner, dev, remotePath, localPath);
      return textResult(msg);
    })
  );

  server.registerTool(
    'execute_shell_command',
    {
      title: 'Execute shell command on device',
      description: 'Executes an arbitrary ADB shell command on the target Android device and returns its standard output.',
      inputSchema: {
        command: z.string().describe('Shell command string to execute (e.g. "ls -la /sdcard", "getprop ro.build.version.release", "df -h").'),
        timeoutMs: z.number().int().positive().optional().describe('Execution timeout in milliseconds (default 15000).'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('execute_shell_command', async ({ command, timeoutMs, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const res = await executeShellCommand(target.adb.runner, dev, command, { timeoutMs });
      return jsonResult(res);
    })
  );
}
