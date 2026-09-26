/**
 * Normalized errors.
 *
 * Raw adb stderr is terse and often misleading ("closed", "error: device offline"). Both the
 * IDE surfaces and an agent need to know *what to do next*, so every failure is mapped to a
 * stable code plus a concrete remedy.
 */

export type AdbErrorCode =
  | 'ADB_NOT_FOUND'
  | 'NO_DEVICE'
  | 'AMBIGUOUS_DEVICE'
  | 'DEVICE_OFFLINE'
  | 'DEVICE_UNAUTHORIZED'
  | 'NOT_DEBUGGABLE'
  | 'PACKAGE_NOT_FOUND'
  | 'PATH_REJECTED'
  | 'TIMEOUT'
  | 'SQLITE_NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'ELEMENT_NOT_FOUND'
  | 'INVALID_KEY'
  | 'FILE_NOT_FOUND'
  | 'COMMAND_FAILED';

export class AdbError extends Error {
  constructor(
    public readonly code: AdbErrorCode,
    message: string,
    /** What the caller should try next. Surfaced verbatim to agents. */
    public readonly hint: string,
    public readonly raw?: string
  ) {
    super(message);
    this.name = 'AdbError';
  }

  /** Single-line form: the failure and its remedy. */
  public toDisplayString(): string {
    return `[${this.code}] ${this.message} — ${this.hint}`;
  }
}

interface Rule {
  match: RegExp;
  code: AdbErrorCode;
  message: string;
  hint: string;
}

const RULES: Rule[] = [
  {
    match: /device unauthorized|user has not given permission/i,
    code: 'DEVICE_UNAUTHORIZED',
    message: 'The device has not authorized this computer for debugging.',
    hint: 'Unlock the device and accept the "Allow USB debugging" prompt, then retry.'
  },
  {
    match: /device .*offline|device offline/i,
    code: 'DEVICE_OFFLINE',
    message: 'The device is connected but not responding to adb.',
    hint: 'Reconnect the cable or re-enable wireless debugging, then run list_devices.'
  },
  {
    match: /more than one device|multiple devices/i,
    code: 'AMBIGUOUS_DEVICE',
    message: 'More than one device is connected and no target was selected.',
    hint: 'Run list_devices, then set_target with the device id you want.'
  },
  {
    match: /no devices\/emulators found|device '.*' not found|device not found/i,
    code: 'NO_DEVICE',
    message: 'No matching device is connected.',
    hint: 'Run list_devices to see what is attached, then set_target.'
  },
  {
    match: /run-as: .*(not debuggable|unknown package)|is not debuggable/i,
    code: 'NOT_DEBUGGABLE',
    message: 'The package is not debuggable, so its private data cannot be read.',
    hint: 'Install a debug build (android:debuggable="true"); release builds block run-as.'
  },
  {
    match: /unknown package|package .* not found|cannot find package/i,
    code: 'PACKAGE_NOT_FOUND',
    message: 'The package is not installed on this device.',
    hint: 'Run list_packages to confirm the id, or install the app first.'
  },
  {
    match: /adb: command not found|no adb binary|enoent/i,
    code: 'ADB_NOT_FOUND',
    message: 'No adb binary could be found or executed.',
    hint: 'Install Android SDK platform-tools, or set ANDROID_HOME / ADB_PATH.'
  }
];

/** Maps raw adb output onto a stable code and a remedy. */
export function normalizeAdbError(raw: unknown, context?: string): AdbError {
  if (raw instanceof AdbError) {
    return raw;
  }
  const text = raw instanceof Error ? raw.message : String(raw ?? '');
  const prefix = context ? `${context}: ` : '';

  for (const rule of RULES) {
    if (rule.match.test(text)) {
      return new AdbError(rule.code, `${prefix}${rule.message}`, rule.hint, text);
    }
  }
  return new AdbError(
    'COMMAND_FAILED',
    `${prefix}${text || 'The adb command failed.'}`,
    'Check that the device is connected and the package id is correct.',
    text
  );
}

export function timeoutError(command: string, timeoutMs: number): AdbError {
  return new AdbError(
    'TIMEOUT',
    `adb ${command} did not finish within ${timeoutMs}ms.`,
    'The device may be asleep or the transfer is large — wake the device or raise timeoutMs.',
    undefined
  );
}
