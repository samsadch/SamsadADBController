import * as apps from './apps';
import * as controls from './deviceControls';
import { DatabaseService } from './databaseService';
import { getDeviceInfo, listDevices } from './devices';
import { AdbRunner } from './exec';
import { getCandidateAdbPaths } from './adbPath';
import { autoDetectPackage } from './packageDetect';
import { captureScreenshot } from './screenshot';
import * as storage from './storage';
import { AdbConfig, AdbDevice, DeviceInfo, RunOptions, SqlQueryResult } from './types';

/**
 * Facade over the capability modules.
 *
 * Kept as a single class with the same method names the IDE surfaces already call, so the
 * Phase 0 extraction is import-path-only for them. New code should prefer the modules
 * directly — this exists for compatibility, not as the shape to build on.
 */
export class AdbExecutor {
  private static instance: AdbExecutor | undefined;

  public readonly runner: AdbRunner;
  public readonly db: DatabaseService;

  constructor(private readonly config: AdbConfig = {}) {
    this.runner = new AdbRunner(config);
    this.db = new DatabaseService(this.runner, config);
  }

  /** Process-wide instance used by the IDE surfaces. The MCP server constructs its own. */
  public static getInstance(config?: AdbConfig): AdbExecutor {
    if (!AdbExecutor.instance) {
      AdbExecutor.instance = new AdbExecutor(config);
    }
    return AdbExecutor.instance;
  }

  // --- process plumbing -----------------------------------------------------------------

  public getCandidateAdbPaths(): string[] { return getCandidateAdbPaths(this.config); }
  public getEnv(): NodeJS.ProcessEnv { return this.runner.getEnv(); }
  public resolveAdbBinary(): Promise<string> { return this.runner.resolveAdbBinary(); }

  public runAdb(deviceId: string | null, ...args: string[]): Promise<string> {
    return this.runner.runAdb(deviceId, ...args);
  }

  /** Escape hatch for callers that need a non-default timeout. */
  public run(deviceId: string | null, args: string[], options?: RunOptions): Promise<string> {
    return this.runner.run(deviceId, args, options);
  }

  // --- devices --------------------------------------------------------------------------

  public getConnectedDevicesWithDiagnostics(): Promise<{ devices: AdbDevice[]; error?: string }> {
    return listDevices(this.runner);
  }

  public async getConnectedDevices(): Promise<AdbDevice[]> {
    return (await listDevices(this.runner)).devices;
  }

  public getDeviceInfo(deviceId: string): Promise<DeviceInfo> {
    return getDeviceInfo(this.runner, deviceId);
  }

  // --- app lifecycle --------------------------------------------------------------------

  public clearAppData(d: string, p: string) { return apps.clearAppData(this.runner, d, p); }
  public forceStopApp(d: string, p: string) { return apps.forceStopApp(this.runner, d, p); }
  public launchApp(d: string, p: string) { return apps.launchApp(this.runner, d, p); }
  public restartApp(d: string, p: string) { return apps.restartApp(this.runner, d, p); }
  public clearAndRestartApp(d: string, p: string) { return apps.clearAndRestartApp(this.runner, d, p); }
  public uninstallApp(d: string, p: string) { return apps.uninstallApp(this.runner, d, p); }
  public openAppInfo(d: string, p: string) { return apps.openAppInfo(this.runner, d, p); }
  public getInstalledPackages(d: string) { return apps.getInstalledPackages(this.runner, d); }

  // --- device controls ------------------------------------------------------------------

  public isNightMode(d: string) { return controls.isNightMode(this.runner, d); }
  public toggleDarkMode(d: string) { return controls.toggleDarkMode(this.runner, d); }
  public toggleLayoutBounds(d: string) { return controls.toggleLayoutBounds(this.runner, d); }
  public toggleAnimations(d: string) { return controls.toggleAnimations(this.runner, d); }
  public setBatteryLevel(d: string, level: number) { return controls.setBatteryLevel(this.runner, d, level); }
  public unplugBattery(d: string) { return controls.unplugBattery(this.runner, d); }
  public resetBattery(d: string) { return controls.resetBattery(this.runner, d); }
  public forceDozeMode(d: string) { return controls.forceDozeMode(this.runner, d); }
  public exitDozeMode(d: string) { return controls.exitDozeMode(this.runner, d); }
  public setAppInactive(d: string, p: string) { return controls.setAppInactive(this.runner, d, p); }
  public sendKeyEvent(d: string, keyCode: number) { return controls.sendKeyEvent(this.runner, d, keyCode); }

  public sendDeepLink(d: string, url: string, pkg?: string) {
    return controls.sendDeepLink(this.runner, d, url, pkg);
  }

  public sendBroadcast(d: string, action: string, key?: string, val?: string, pkg?: string) {
    return controls.sendBroadcast(this.runner, d, action, key, val, pkg);
  }

  // --- storage --------------------------------------------------------------------------

  public getSharedPrefsFiles(d: string, p: string) { return storage.getSharedPrefsFiles(this.runner, d, p); }
  public readSharedPrefsXml(d: string, p: string, f: string) { return storage.readSharedPrefsXml(this.runner, d, p, f); }
  public writeSharedPrefsXml(d: string, p: string, f: string, xml: string) {
    return storage.writeSharedPrefsXml(this.runner, d, p, f, xml);
  }
  public dumpSharedPreferences(d: string, p: string) { return storage.dumpSharedPreferences(this.runner, d, p); }
  public getDatabaseFiles(d: string, p: string) { return storage.getDatabaseFiles(this.runner, d, p); }
  public exportAppData(d: string, p: string, root: string) {
    return storage.exportAppData(this.runner, d, p, root);
  }

  // --- databases ------------------------------------------------------------------------

  public getDatabaseTables(d: string, p: string, db: string): Promise<string[]> {
    return this.db.getTables(d, p, db);
  }

  public executeSqlQuery(d: string, p: string, db: string, sql: string): Promise<SqlQueryResult> {
    return this.db.query(d, p, db, sql);
  }

  public updateTableCell(
    d: string, p: string, db: string, table: string,
    pkCol: string, pkVal: string, col: string, val: string
  ): Promise<string> {
    return this.db.updateCell(d, p, db, table, pkCol, pkVal, col, val);
  }

  public deleteTableRow(
    d: string, p: string, db: string, table: string, pkCol: string, pkVal: string
  ): Promise<string> {
    return this.db.deleteRow(d, p, db, table, pkCol, pkVal);
  }

  // --- misc -----------------------------------------------------------------------------

  public captureScreenshot(d: string) { return captureScreenshot(this.runner, d); }

  public async autoDetectPackage(rootPaths: string[]): Promise<string | null> {
    return autoDetectPackage(rootPaths);
  }
}
