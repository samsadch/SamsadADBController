# @samsadch/adb-core

The shared ADB capability layer behind [ADB Controller by Samsad](https://github.com/samsadch/SamsadADBController) —
used by its VS Code extension and by [`@samsadch/adb-mcp`](https://www.npmjs.com/package/@samsadch/adb-mcp),
the MCP server that lets AI agents drive an Android device.

It is a plain TypeScript library with **no IDE dependency**: host configuration is injected, so
the same code runs inside an editor, inside an MCP server, or in a script.

## Install

```bash
npm install @samsadch/adb-core
```

Requires Node 18+ and Android SDK platform-tools on `PATH` (or `ANDROID_HOME` / `ADB_PATH` set).

## Usage

```ts
import { AdbExecutor, listDevices, getDeviceInfo } from '@samsadch/adb-core';

const adb = new AdbExecutor();               // or new AdbExecutor({ adbPath: '/custom/adb' })

const { devices } = await listDevices(adb.runner);
const info = await getDeviceInfo(adb.runner, devices[0].id);
console.log(info.androidVersion, info.sdkLevel, info.screenSize);

await adb.restartApp(devices[0].id, 'com.example.app');
```

## What it covers

| Area | Functions |
|---|---|
| Devices | `listDevices`, `getDeviceInfo` |
| App lifecycle | `launchApp`, `restartApp`, `clearAppData`, `forceStopApp`, `uninstallApp`, `getInstalledPackages` |
| Display & power | `toggleDarkMode`, `toggleAnimations`, `toggleLayoutBounds`, `setBatteryLevel`, `forceDozeMode`, … |
| Input & intents | `sendKeyEvent`, `sendDeepLink`, `sendBroadcast` |
| Storage | `getSharedPrefsFiles`, `readSharedPrefsXml`, `writeSharedPrefsXml`, `exportAppData` |
| Databases | `DatabaseService` — pulls the app's SQLite file, queries it with the host `sqlite3`, pushes writes back |
| Workspace | `autoDetectPackage` — finds an `applicationId` from Gradle or the manifest |

`AdbExecutor` is a convenience facade over these; the modules can also be imported directly.

## Configuration

Pass an `AdbConfig`, or rely on the environment.

| Field | Environment fallback | Purpose |
|---|---|---|
| `adbPath` | `ADB_PATH` | Explicit path to the `adb` binary |
| `androidSdkPath` | `ANDROID_HOME`, `ANDROID_SDK_ROOT` | SDK root; `platform-tools/adb` derived from it |
| `sqlitePath` | `SQLITE_PATH` | Explicit path to `sqlite3` |

With none set, the usual SDK locations on macOS, Linux and Windows are probed in order.

## Errors

Every failure is normalized to an `AdbError` carrying a stable `code` and a `hint` describing
what to do next, rather than raw adb stderr:

```ts
try {
  await adb.readSharedPrefsXml(id, pkg, 'session.xml');
} catch (err) {
  const e = normalizeAdbError(err);
  console.error(e.code);              // 'NOT_DEBUGGABLE'
  console.error(e.toDisplayString()); // [NOT_DEBUGGABLE] … — Install a debug build …
}
```

Codes: `ADB_NOT_FOUND`, `NO_DEVICE`, `AMBIGUOUS_DEVICE`, `DEVICE_OFFLINE`, `DEVICE_UNAUTHORIZED`,
`NOT_DEBUGGABLE`, `PACKAGE_NOT_FOUND`, `PATH_REJECTED`, `TIMEOUT`, `SQLITE_NOT_FOUND`,
`COMMAND_FAILED`.

## Known issues

`captureScreenshot` and the database half of `exportAppData` rely on a shell redirect that is
swallowed by argument quoting, so they currently write nothing locally. Both are marked in the
source and scheduled for the next release. See Issue I1 in the repository's `PROJECT.md`.

## License

MIT
