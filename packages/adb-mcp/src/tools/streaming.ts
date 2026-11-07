import { z } from 'zod';
import {
  checkAndroidCliAvailable,
  listStreamingDevices,
  startDeviceStream,
  stopDeviceStream
} from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';

/**
 * Registers tools for Google Android Cloud Device Streaming via the official Android CLI.
 */
export function registerDeviceStreamingTools(server: McpServer): void {
  server.registerTool(
    'list_cloud_devices',
    {
      title: 'List Android Device Streaming cloud devices',
      description: 'Lists remote physical devices (Pixel, Galaxy, foldables) available for cloud streaming via the Android CLI.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('list_cloud_devices', async () => {
      const cliReady = await checkAndroidCliAvailable();
      if (!cliReady) {
        return jsonResult({
          available: false,
          devices: [],
          message: 'Android CLI ("android") is not installed or not in system PATH. Install it to enable cloud device streaming.'
        });
      }
      const devices = await listStreamingDevices();
      return jsonResult({
        available: true,
        devices,
        count: devices.length
      });
    })
  );

  server.registerTool(
    'start_cloud_device_stream',
    {
      title: 'Start Android Device Streaming session',
      description: 'Reserves and connects to a remote physical device in Google Cloud over an ADB-over-SSL tunnel.',
      inputSchema: {
        deviceModel: z.string().describe('Cloud device model or ID (e.g. "Pixel 10 Pro", "Pixel 9", "Galaxy S24").'),
        project: z.string().optional().describe('Google Cloud / Firebase project ID if not configured globally.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('start_cloud_device_stream', async ({ deviceModel, project }) => {
      const res = await startDeviceStream(deviceModel, { project });
      return textResult(res.message);
    })
  );

  server.registerTool(
    'stop_cloud_device_stream',
    {
      title: 'Stop Android Device Streaming session',
      description: 'Releases a cloud device reservation session started via Android CLI.',
      inputSchema: {
        sessionIdOrDevice: z.string().describe('Active session ID or device identifier to stop.')
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard('stop_cloud_device_stream', async ({ sessionIdOrDevice }) => {
      const res = await stopDeviceStream(sessionIdOrDevice);
      return textResult(res.message);
    })
  );
}
