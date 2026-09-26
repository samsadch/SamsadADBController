import { z } from 'zod';
import { listDevices } from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/** Device discovery and the sticky-target tools every other tool depends on. */
export function registerTargetTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'list_devices',
    {
      title: 'List connected devices',
      description:
        'Lists every connected Android device and emulator with its id, model and connection ' +
        'state. Use this first when no target is set, or when a call reports NO_DEVICE or ' +
        'AMBIGUOUS_DEVICE.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('list_devices', async () => {
      const { devices, error } = await listDevices(target.adb.runner);
      if (error) {
        return { content: [{ type: 'text' as const, text: error }], isError: true };
      }
      if (devices.length === 0) {
        return textResult(
          'No devices connected. Attach a device over USB, start an emulator, or pair one ' +
          'over wireless debugging, then run list_devices again.'
        );
      }
      return jsonResult({
        devices: devices.map(d => ({
          id: d.id,
          model: d.model,
          state: d.state,
          isEmulator: d.isEmulator
        })),
        currentTarget: target.snapshot()
      });
    })
  );

  server.registerTool(
    'set_target',
    {
      title: 'Set target device and package',
      description:
        'Pins the device and/or Android package that every other tool will act on, so they ' +
        'do not have to be passed on each call. Set this once at the start of a session. ' +
        'With a single device connected the device is inferred automatically, and the package ' +
        'is detected from the workspace when the client exposes roots.',
      inputSchema: {
        device: z
          .string()
          .optional()
          .describe('Device id exactly as list_devices reports it, e.g. "emulator-5554".'),
        packageName: z
          .string()
          .optional()
          .describe('Android applicationId, e.g. "com.example.app".')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('set_target', async ({ device, packageName }) => {
      if (device) {
        const { devices } = await listDevices(target.adb.runner);
        const match = devices.find(d => d.id === device);
        if (!match) {
          const known = devices.map(d => d.id).join(', ') || 'none';
          return {
            content: [{
              type: 'text' as const,
              text: `[NO_DEVICE] '${device}' is not connected. Connected devices: ${known}.`
            }],
            isError: true
          };
        }
        target.setDevice(device);
      }
      if (packageName) {
        target.setPackage(packageName);
      }
      if (!device && !packageName) {
        // Nothing specified: resolve whatever can be inferred and report it.
        await target.resolveDevice().catch(() => undefined);
        await target.resolvePackage().catch(() => undefined);
      }
      return jsonResult({ target: target.snapshot() });
    })
  );
}
