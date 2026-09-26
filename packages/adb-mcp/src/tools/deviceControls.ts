import { z } from 'zod';
import {
  exitDozeMode,
  forceDozeMode,
  resetBattery,
  sendBroadcast,
  setBatteryLevel,
  toggleAnimations,
  toggleDarkMode,
  unplugBattery
} from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers device hardware, power simulator, display, and broadcast tools.
 */
export function registerDeviceControlTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'set_battery_level',
    {
      title: 'Set simulated battery level',
      description: 'Simulates a specific battery level percentage (0-100) and automatically unplugs device from power.',
      inputSchema: {
        level: z.number().min(0).max(100).describe('Battery percentage level from 0 to 100.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard('set_battery_level', async ({ level, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await setBatteryLevel(target.adb.runner, dev, level);
      return textResult(msg);
    })
  );

  server.registerTool(
    'unplug_battery',
    {
      title: 'Simulate battery unplugged (discharging)',
      description: 'Simulates disconnecting the Android device from charger / AC power supply (sets state to discharging).',
      inputSchema: {
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard('unplug_battery', async ({ device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await unplugBattery(target.adb.runner, dev);
      return textResult(msg);
    })
  );

  server.registerTool(
    'reset_battery',
    {
      title: 'Reset battery to hardware state',
      description: 'Restores battery reporting and charging status to the physical / real hardware state.',
      inputSchema: {
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard('reset_battery', async ({ device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await resetBattery(target.adb.runner, dev);
      return textResult(msg);
    })
  );

  server.registerTool(
    'force_doze_mode',
    {
      title: 'Force device into Doze mode',
      description: 'Forces device into deep Doze mode (idle state) for testing background jobs, alarms, and battery optimizations.',
      inputSchema: {
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard('force_doze_mode', async ({ device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await forceDozeMode(target.adb.runner, dev);
      return textResult(msg);
    })
  );

  server.registerTool(
    'exit_doze_mode',
    {
      title: 'Exit Doze mode',
      description: 'Unforces Doze mode and restores normal active operation on the device.',
      inputSchema: {
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard('exit_doze_mode', async ({ device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await exitDozeMode(target.adb.runner, dev);
      return textResult(msg);
    })
  );

  server.registerTool(
    'toggle_dark_mode',
    {
      title: 'Toggle or set system Dark Mode',
      description: 'Switches system UI theme between Dark Mode and Light Mode, or sets an explicit mode.',
      inputSchema: {
        mode: z.enum(['light', 'dark', 'toggle']).optional().default('toggle').describe('Explicit theme mode ("light" or "dark"), or "toggle" (default).'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('toggle_dark_mode', async ({ mode, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await toggleDarkMode(target.adb.runner, dev, mode);
      return textResult(msg);
    })
  );

  server.registerTool(
    'toggle_animations',
    {
      title: 'Toggle or set system animations',
      description: 'Enables or disables system UI animations (window, transition, and animator scales) or toggles between 1.0x and 0.0x.',
      inputSchema: {
        enabled: z.boolean().optional().describe('Explicitly set animations ON (true: 1.0x), OFF (false: 0.0x), or omit to toggle current state.'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('toggle_animations', async ({ enabled, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await toggleAnimations(target.adb.runner, dev, enabled);
      return textResult(msg);
    })
  );

  server.registerTool(
    'send_broadcast',
    {
      title: 'Send Android broadcast intent',
      description: 'Sends a custom broadcast intent to registered receivers with optional target package, component, and typed extras.',
      inputSchema: {
        action: z.string().describe('Broadcast intent action string (e.g. "android.intent.action.BOOT_COMPLETED" or "com.example.ACTION_SYNC").'),
        packageName: z.string().optional().describe('Package applicationId to restrict the broadcast to.'),
        component: z.string().optional().describe('Explicit receiver component class (e.g. "com.example.app/.receiver.MyReceiver").'),
        extras: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe('Key-value dictionary of intent extra values (strings, numbers, booleans).'),
        device: z.string().optional().describe('Device serial/identifier. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('send_broadcast', async ({ action, packageName, component, extras, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const msg = await sendBroadcast(target.adb.runner, dev, {
        action,
        pkg: packageName,
        component,
        extras
      });
      return textResult(msg);
    })
  );
}
