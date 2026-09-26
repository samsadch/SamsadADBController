import { z } from 'zod';
import { executeShellCommand, pullFile, pushFile } from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers file transfer and ad-hoc shell command execution tools.
 */
export function registerSystemTools(server: McpServer, target: TargetStore): void {
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
