import { AdbRunner } from './exec';

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F';

export interface LogcatOptions {
  packageName?: string;
  filterByPackage?: boolean;
  logLevel?: LogLevel;
  tag?: string;
  search?: string;
  lineLimit?: number;
  clearFirst?: boolean;
}

export interface LogcatResult {
  lines: string[];
  totalLines: number;
  lineLimit: number;
  logLevel?: LogLevel;
  tag?: string;
  packageName?: string;
  device: string;
}

export interface MemoryInfo {
  packageName: string;
  totalPssKb: number;
  totalPssMb: number;
  totalRssKb: number;
  totalRssMb: number;
  javaHeapKb?: number;
  nativeHeapKb?: number;
  codeKb?: number;
  stackKb?: number;
  graphicsKb?: number;
  privateOtherKb?: number;
  systemKb?: number;
  rawSummary: string;
}

/**
 * Gets PID of a running package on device.
 */
export async function getPackagePid(runner: AdbRunner, deviceId: string, pkg: string): Promise<string | null> {
  try {
    const pidOut = await runner.run(deviceId, ['shell', 'pidof', '-s', pkg]);
    const pid = pidOut.trim();
    if (pid && /^\d+$/.test(pid)) {
      return pid;
    }
  } catch { /* pidof might not be available on older emulators */ }

  try {
    const psOut = await runner.run(deviceId, ['shell', 'ps', '-A']);
    const lines = psOut.split('\n');
    for (const line of lines) {
      if (line.includes(pkg)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
          return parts[1];
        }
      }
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Clears logcat buffers on the device.
 */
export async function clearLogcat(runner: AdbRunner, deviceId: string): Promise<string> {
  await runner.run(deviceId, ['shell', 'logcat', '-c']);
  return 'Logcat buffer cleared';
}

/**
 * Dumps and filters logcat logs without hanging.
 */
export async function getLogcat(
  runner: AdbRunner,
  deviceId: string,
  options: LogcatOptions = {}
): Promise<LogcatResult> {
  if (options.clearFirst) {
    await clearLogcat(runner, deviceId).catch(() => undefined);
  }

  const args = ['shell', 'logcat', '-d', '-v', 'time'];

  let pid: string | null = null;
  if (options.packageName && options.filterByPackage !== false) {
    pid = await getPackagePid(runner, deviceId, options.packageName);
    if (pid) {
      args.push(`--pid=${pid}`);
    }
  }

  if (options.tag && options.logLevel) {
    args.push(`${options.tag}:${options.logLevel}`, '*:S');
  } else if (options.tag) {
    args.push(`${options.tag}:V`, '*:S');
  } else if (options.logLevel) {
    args.push(`*:${options.logLevel}`);
  }

  let rawLogs = '';
  try {
    rawLogs = await runner.run(deviceId, args, { maxBuffer: 16 * 1024 * 1024 });
  } catch (err: unknown) {
    // If --pid failed (e.g. older Android version), fall back to general logcat
    if (pid) {
      const fallbackArgs = args.filter(a => !a.startsWith('--pid='));
      rawLogs = await runner.run(deviceId, fallbackArgs, { maxBuffer: 16 * 1024 * 1024 });
    } else {
      throw err;
    }
  }

  let lines = rawLogs
    .split('\n')
    .map(l => l.trimEnd())
    .filter(l => l.length > 0 && !l.startsWith('--------- beginning of'));

  if (pid && !args.some(a => a.startsWith('--pid='))) {
    // Client-side PID filtering fallback
    lines = lines.filter(l => l.includes(`(${pid})`));
  }

  if (options.search) {
    const searchLower = options.search.toLowerCase();
    lines = lines.filter(l => l.toLowerCase().includes(searchLower));
  }

  const totalLines = lines.length;
  const limit = Math.min(Math.max(options.lineLimit ?? 200, 1), 2000);
  const slicedLines = lines.slice(-limit);

  return {
    lines: slicedLines,
    totalLines,
    lineLimit: limit,
    logLevel: options.logLevel,
    tag: options.tag,
    packageName: options.packageName,
    device: deviceId
  };
}

/**
 * Inspects process memory allocation using `dumpsys meminfo`.
 */
export async function getAppMemory(
  runner: AdbRunner,
  deviceId: string,
  pkg: string
): Promise<MemoryInfo> {
  const output = await runner.run(deviceId, ['shell', 'dumpsys', 'meminfo', pkg]);

  const pssMatch = /TOTAL PSS:\s*(\d+)/i.exec(output) || /TOTAL:\s*(\d+)/i.exec(output);
  const rssMatch = /TOTAL RSS:\s*(\d+)/i.exec(output);
  const javaHeapMatch = /Java Heap:\s*(\d+)/i.exec(output);
  const nativeHeapMatch = /Native Heap:\s*(\d+)/i.exec(output);
  const codeMatch = /Code:\s*(\d+)/i.exec(output);
  const stackMatch = /Stack:\s*(\d+)/i.exec(output);
  const graphicsMatch = /Graphics:\s*(\d+)/i.exec(output);
  const privateOtherMatch = /Private Other:\s*(\d+)/i.exec(output);
  const systemMatch = /System:\s*(\d+)/i.exec(output);

  const totalPssKb = pssMatch ? parseInt(pssMatch[1], 10) : 0;
  const totalRssKb = rssMatch ? parseInt(rssMatch[1], 10) : 0;

  // Extract the summary section at the bottom if present
  const summaryIndex = output.indexOf('App Summary');
  const rawSummary = summaryIndex !== -1 ? output.substring(summaryIndex) : output.slice(0, 1000);

  return {
    packageName: pkg,
    totalPssKb,
    totalPssMb: Math.round((totalPssKb / 1024) * 100) / 100,
    totalRssKb,
    totalRssMb: Math.round((totalRssKb / 1024) * 100) / 100,
    javaHeapKb: javaHeapMatch ? parseInt(javaHeapMatch[1], 10) : undefined,
    nativeHeapKb: nativeHeapMatch ? parseInt(nativeHeapMatch[1], 10) : undefined,
    codeKb: codeMatch ? parseInt(codeMatch[1], 10) : undefined,
    stackKb: stackMatch ? parseInt(stackMatch[1], 10) : undefined,
    graphicsKb: graphicsMatch ? parseInt(graphicsMatch[1], 10) : undefined,
    privateOtherKb: privateOtherMatch ? parseInt(privateOtherMatch[1], 10) : undefined,
    systemKb: systemMatch ? parseInt(systemMatch[1], 10) : undefined,
    rawSummary: rawSummary.trim()
  };
}
