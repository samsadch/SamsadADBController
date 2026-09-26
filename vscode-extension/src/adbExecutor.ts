import * as vscode from 'vscode';
import { AdbConfig, AdbExecutor as CoreAdbExecutor } from '@samsadch/adb-core';

/**
 * VS Code binding for the shared core.
 *
 * The capability layer lives in `@samsadch/adb-core` and knows nothing about VS Code; this file
 * is the only place that reads extension settings and hands them over as plain config.
 */

export type { AdbDevice, SqlQueryResult, DeviceInfo } from '@samsadch/adb-core';

function readConfig(): AdbConfig {
  const settings = vscode.workspace.getConfiguration('samsadAdb');
  return {
    adbPath: (settings.get<string>('adbPath') || '').trim() || undefined,
    androidSdkPath: (settings.get<string>('androidSdkPath') || '').trim() || undefined,
    sqlitePath: (settings.get<string>('sqlitePath') || '').trim() || undefined
  };
}

let instance: CoreAdbExecutor | undefined;

export const AdbExecutor = {
  getInstance(): CoreAdbExecutor {
    if (!instance) {
      instance = new CoreAdbExecutor(readConfig());
    }
    return instance;
  },

  /** Drops the cached instance so the next call picks up changed settings. */
  reset(): void {
    instance = undefined;
  }
};
