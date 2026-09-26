import { AdbRunner } from './exec';

/**
 * Dispatches an explicit or implicit VIEW intent for URI schemes and App Links.
 */
export async function openDeepLink(
  runner: AdbRunner,
  deviceId: string,
  url: string,
  packageName?: string
): Promise<{ url: string; packageName?: string; output: string }> {
  const args = ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url];
  if (packageName) {
    args.push('-p', packageName);
  }
  const output = await runner.run(deviceId, args);
  return {
    url,
    packageName,
    output
  };
}
