import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface StreamingDevice {
  id: string;
  name: string;
  apiLevel: number;
  available: boolean;
  model: string;
  manufacturer?: string;
  formFactor?: string;
}

export interface StreamingSessionResult {
  sessionId?: string;
  device?: string;
  status: string;
  message: string;
}

/**
 * Checks if the official Google `android` CLI tool is installed and accessible.
 */
export async function checkAndroidCliAvailable(): Promise<boolean> {
  try {
    await execFileAsync('android', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists available cloud devices for Android Device Streaming using the `android` CLI.
 */
export async function listStreamingDevices(): Promise<StreamingDevice[]> {
  try {
    const { stdout } = await execFileAsync('android', ['device-streaming', 'list', '--json']);
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      return parsed.map((d: any) => ({
        id: d.id || d.device_id || d.name,
        name: d.name || d.display_name || 'Cloud Device',
        apiLevel: Number(d.api_level || d.api || 35),
        available: Boolean(d.available ?? true),
        model: d.model || d.id,
        manufacturer: d.manufacturer,
        formFactor: d.form_factor || 'phone'
      }));
    }
  } catch {
    // If json flag or device-streaming command output is raw text or unavailable
  }

  // Fallback: check command output or report mock/default device profiles
  try {
    const { stdout } = await execFileAsync('android', ['device-streaming', 'list']);
    const lines = stdout.split('\n');
    const devices: StreamingDevice[] = [];
    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(Pixel\s+[\w\s]+|Galaxy\s+[\w\s]+)\s+API\s+(\d+)\s+(\w+)/i);
      if (match) {
        devices.push({
          id: match[1],
          name: match[2].trim(),
          model: match[2].trim(),
          apiLevel: parseInt(match[3], 10),
          available: match[4].toLowerCase() === 'available'
        });
      }
    }
    if (devices.length > 0) return devices;
  } catch {
    // CLI may not have active GCP auth credentials yet
  }

  return [];
}

/**
 * Initiates an Android Device Streaming session for a specified cloud device.
 */
export async function startDeviceStream(
  deviceModelOrId: string,
  options: { project?: string; timeoutMinutes?: number } = {}
): Promise<StreamingSessionResult> {
  const args = ['device-streaming', 'start', deviceModelOrId];
  if (options.project) {
    args.push(`--project=${options.project}`);
  }

  try {
    const { stdout } = await execFileAsync('android', args);
    return {
      status: 'started',
      message: stdout.trim() || `Started cloud device stream for ${deviceModelOrId}`
    };
  } catch (err: any) {
    throw new Error(`Failed to start Android device stream for ${deviceModelOrId}: ${err.message}`);
  }
}

/**
 * Stops an active Android Device Streaming session.
 */
export async function stopDeviceStream(
  sessionIdOrDevice: string
): Promise<StreamingSessionResult> {
  try {
    const { stdout } = await execFileAsync('android', ['device-streaming', 'stop', sessionIdOrDevice]);
    return {
      status: 'stopped',
      message: stdout.trim() || `Stopped device streaming session ${sessionIdOrDevice}`
    };
  } catch (err: any) {
    throw new Error(`Failed to stop device streaming session ${sessionIdOrDevice}: ${err.message}`);
  }
}
