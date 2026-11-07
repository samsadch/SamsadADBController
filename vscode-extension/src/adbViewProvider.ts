import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { AdbExecutor, AdbDevice } from './adbExecutor';

export class AdbViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'samsadAdbView';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._view?.webview.postMessage({ type: 'triggerRefresh' });
      }
    });

    webviewView.webview.onDidReceiveMessage(async (data) => {
      const executor = AdbExecutor.getInstance();
      const { command, deviceId, packageName } = data;

      switch (command) {
        case 'refreshDevices': {
          this.postStatus('loading', '⏳ Scanning connected devices...');
          const result = await executor.getConnectedDevicesWithDiagnostics();
          this._view?.webview.postMessage({
            type: 'setDevices',
            devices: result.devices,
            error: result.error
          });
          if (result.error) {
            this.postStatus('error', `✕ ${result.error.slice(0, 80)}`);
          } else if (result.devices.length === 0) {
            this.postStatus('idle', 'ℹ️ No devices attached. Connect via USB or Wi-Fi.');
          } else {
            this.postStatus('success', `✓ Connected: ${result.devices.length} device ready`);
            const firstDev = result.devices[0]?.id;
            if (firstDev && !result.devices[0].displayName.includes('Unauthorized') && !result.devices[0].displayName.includes('Offline')) {
              try {
                const isNight = await executor.isNightMode(firstDev);
                const pkgs = await executor.getInstalledPackages(firstDev);
                this._view?.webview.postMessage({ type: 'setNightMode', isNight });
                this._view?.webview.postMessage({ type: 'setInstalledPackages', packages: pkgs });
              } catch {}
            }
          }
          break;
        }

        case 'deviceChanged': {
          if (deviceId) {
            const isNight = await executor.isNightMode(deviceId);
            const pkgs = await executor.getInstalledPackages(deviceId);
            this._view?.webview.postMessage({ type: 'setNightMode', isNight });
            this._view?.webview.postMessage({ type: 'setInstalledPackages', packages: pkgs });
          }
          break;
        }

        case 'autoDetectPackage': {
          const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];
          this.postStatus('loading', '⏳ Detecting package name...');
          const detected = await executor.autoDetectPackage(workspaceFolders);
          if (detected) {
            this._view?.webview.postMessage({ type: 'setPackage', packageName: detected });
            this.postStatus('success', `✓ Package detected: ${detected}`);
          } else {
            this.postStatus('error', '✕ Could not auto-detect package in workspace');
          }
          break;
        }

        case 'restartApp': {
          this.executeAppTask('Restart App', () => executor.restartApp(deviceId, packageName));
          break;
        }

        case 'clearAppData': {
          this.executeAppTask('Clear App Data', () => executor.clearAppData(deviceId, packageName));
          break;
        }

        case 'clearAndRestartApp': {
          this.executeAppTask('Clear & Restart', () => executor.clearAndRestartApp(deviceId, packageName));
          break;
        }

        case 'forceStopApp': {
          this.executeAppTask('Force Stop', () => executor.forceStopApp(deviceId, packageName));
          break;
        }

        case 'uninstallApp': {
          this.executeAppTask('Uninstall App', () => executor.uninstallApp(deviceId, packageName));
          break;
        }

        case 'openAppInfo': {
          this.executeAppTask('Open App Info', () => executor.openAppInfo(deviceId, packageName));
          break;
        }

        case 'toggleDarkMode': {
          this.executeDeviceTask('Toggle Dark Mode', async () => {
            const res = await executor.toggleDarkMode(deviceId);
            const isNight = await executor.isNightMode(deviceId);
            this._view?.webview.postMessage({ type: 'setNightMode', isNight });
            return res;
          });
          break;
        }

        case 'getSharedPrefsFiles': {
          if (deviceId && packageName) {
            const files = await executor.getSharedPrefsFiles(deviceId, packageName);
            this._view?.webview.postMessage({ type: 'setSharedPrefsFiles', files });
          }
          break;
        }

        case 'readSharedPrefsXml': {
          const fileName = data.fileName;
          if (deviceId && packageName && fileName) {
            try {
              const xml = await executor.readSharedPrefsXml(deviceId, packageName, fileName);
              this._view?.webview.postMessage({ type: 'setSharedPrefsXml', fileName, xml });
            } catch (e: any) {
              this.postStatus('error', `✕ Failed to read ${fileName}: ${e.message?.slice(0, 50)}`);
            }
          }
          break;
        }

        case 'saveSharedPrefsXml': {
          const { fileName, xmlContent, restart } = data;
          this.executeAppTask('Save SharedPreferences', async () => {
            const res = await executor.writeSharedPrefsXml(deviceId, packageName, fileName, xmlContent);
            if (restart) {
              await executor.restartApp(deviceId, packageName);
              return `${res} & restarted app`;
            }
            return res;
          });
          break;
        }

        case 'getDatabaseFiles': {
          if (deviceId && packageName) {
            const files = await executor.getDatabaseFiles(deviceId, packageName);
            this._view?.webview.postMessage({ type: 'setDatabaseFiles', files });
            if (files.length === 0) {
              this.postStatus('idle', `ℹ️ No databases for ${packageName} (is the app debuggable?)`);
            }
          }
          break;
        }

        case 'getDatabaseTables': {
          const dbName = data.dbName;
          if (deviceId && packageName && dbName) {
            try {
              this.postStatus('loading', `⏳ Reading ${dbName}...`);
              const tables = await executor.getDatabaseTables(deviceId, packageName, dbName);
              this._view?.webview.postMessage({ type: 'setDatabaseTables', dbName, tables });
              this.postStatus(
                tables.length ? 'success' : 'idle',
                tables.length ? `✓ ${dbName}: ${tables.length} table(s)` : `ℹ️ ${dbName} has no user tables`
              );
            } catch (e: any) {
              // Without this the failure looked identical to an empty database.
              this._view?.webview.postMessage({ type: 'setDatabaseTables', dbName, tables: [] });
              this.postStatus('error', `✕ ${dbName}: ${e.message?.slice(0, 90)}`);
            }
          }
          break;
        }

        case 'getTableData': {
          const { dbName, tableName } = data;
          if (deviceId && packageName && dbName && tableName) {
            try {
              const res = await executor.executeSqlQuery(deviceId, packageName, dbName, `SELECT * FROM \`${tableName}\` LIMIT 100;`);
              this._view?.webview.postMessage({ type: 'setTableData', dbName, tableName, queryResult: res });
            } catch (e: any) {
              this.postStatus('error', `✕ Failed to load table ${tableName}: ${e.message?.slice(0, 50)}`);
            }
          }
          break;
        }

        case 'executeSqlQuery': {
          const { dbName, sql } = data;
          if (deviceId && packageName && dbName && sql) {
            try {
              const res = await executor.executeSqlQuery(deviceId, packageName, dbName, sql);
              this._view?.webview.postMessage({ type: 'setSqlResult', queryResult: res });
              this.postStatus('success', `✓ ${res.message || 'Query executed'}`);
            } catch (e: any) {
              this.postStatus('error', `✕ SQL Error: ${e.message?.slice(0, 50)}`);
              this._view?.webview.postMessage({ type: 'setSqlResult', queryResult: { columns: [], rows: [], message: e.message, isQuery: false } });
            }
          }
          break;
        }

        case 'updateTableCell': {
          const { dbName, tableName, pkCol, pkVal, targetCol, newVal } = data;
          this.executeAppTask('Update Cell', () => executor.updateTableCell(deviceId, packageName, dbName, tableName, pkCol, pkVal, targetCol, newVal));
          break;
        }

        case 'deleteTableRow': {
          const { dbName, tableName, pkCol, pkVal } = data;
          this.executeAppTask('Delete Row', () => executor.deleteTableRow(deviceId, packageName, dbName, tableName, pkCol, pkVal));
          break;
        }

        case 'exportAppData': {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!workspaceFolder) {
            this.postStatus('error', '✕ No active workspace folder open');
            return;
          }
          this.executeAppTask('Export App Data', () => executor.exportAppData(deviceId, packageName, workspaceFolder));
          break;
        }

        case 'setBatteryLevel': {
          const level = data.level;
          this.executeDeviceTask(`Battery ${level}%`, () => executor.setBatteryLevel(deviceId, level));
          break;
        }

        case 'unplugBattery': {
          this.executeDeviceTask('Unplug Battery', () => executor.unplugBattery(deviceId));
          break;
        }

        case 'resetBattery': {
          this.executeDeviceTask('Reset Battery', () => executor.resetBattery(deviceId));
          break;
        }

        case 'forceDozeMode': {
          this.executeDeviceTask('Enter Doze', () => executor.forceDozeMode(deviceId));
          break;
        }

        case 'exitDozeMode': {
          this.executeDeviceTask('Exit Doze', () => executor.exitDozeMode(deviceId));
          break;
        }

        case 'setAppInactive': {
          this.executeAppTask('App Standby', () => executor.setAppInactive(deviceId, packageName));
          break;
        }

        case 'toggleLayoutBounds': {
          this.executeDeviceTask('Toggle Layout Bounds', () => executor.toggleLayoutBounds(deviceId));
          break;
        }

        case 'toggleAnimations': {
          this.executeDeviceTask('Toggle Animations', () => executor.toggleAnimations(deviceId));
          break;
        }

        case 'screenshot': {
          this.executeDeviceTask('Screenshot', () => executor.captureScreenshot(deviceId));
          break;
        }

        case 'sendKeyEvent': {
          const keyCode = data.keyCode;
          this.executeDeviceTask(`Key (${keyCode})`, () => executor.sendKeyEvent(deviceId, keyCode));
          break;
        }

        case 'sendDeepLink': {
          const url = data.url;
          if (!url) {
            this.postStatus('error', '✕ Please enter a Deep Link URL');
            return;
          }
          this.executeDeviceTask('Deep Link', () => executor.sendDeepLink(deviceId, url, packageName));
          break;
        }

        case 'sendBroadcast': {
          const action = data.action;
          if (!action) {
            this.postStatus('error', '✕ Please enter a Broadcast action');
            return;
          }
          const { extraKey, extraVal } = data;
          this.executeDeviceTask('Broadcast', () => executor.sendBroadcast(deviceId, action, extraKey, extraVal, packageName));
          break;
        }

        case 'getLogcat': {
          if (!deviceId) {
            this.postStatus('error', '✕ Please select a connected device');
            return;
          }
          const { logLevel, tag, search, lineLimit, filterByPackage } = data;
          this.postStatus('loading', '⏳ Fetching logcat...');
          try {
            const res = await executor.getLogcat(deviceId, {
              packageName: filterByPackage ? packageName : undefined,
              filterByPackage,
              logLevel: logLevel || undefined,
              tag: tag || undefined,
              search: search || undefined,
              lineLimit: lineLimit ? Number(lineLimit) : 100
            });
            this._view?.webview.postMessage({
              type: 'setLogcatResult',
              lines: res.lines,
              totalLines: res.totalLines
            });
            this.postStatus('success', `✓ Logcat: ${res.lines.length} lines fetched`);
          } catch (e: any) {
            this.postStatus('error', `✕ Logcat failed: ${e.message?.slice(0, 60)}`);
          }
          break;
        }

        case 'clearLogcat': {
          this.executeDeviceTask('Clear Logcat Buffer', () => executor.clearLogcat(deviceId));
          break;
        }

        case 'getAppMemory': {
          if (!deviceId || !packageName) {
            this.postStatus('error', '✕ Select a device and package first');
            return;
          }
          this.postStatus('loading', `⏳ Inspecting memory for ${packageName}...`);
          try {
            const mem = await executor.getAppMemory(deviceId, packageName);
            this._view?.webview.postMessage({
              type: 'setAppMemoryResult',
              memoryInfo: mem
            });
            this.postStatus('success', `✓ Memory: ${mem.totalPssMb.toFixed(1)} MB PSS (${mem.totalRssMb.toFixed(1)} MB RSS)`);
          } catch (e: any) {
            this.postStatus('error', `✕ Memory profiling failed: ${e.message?.slice(0, 60)}`);
          }
          break;
        }

        case 'pushFile': {
          const { localPath, remotePath } = data;
          if (!localPath || !remotePath) {
            this.postStatus('error', '✕ Provide both local and remote paths');
            return;
          }
          this.executeDeviceTask(`Push ${localPath}`, () => executor.pushFile(deviceId, localPath, remotePath));
          break;
        }

        case 'pullFile': {
          const { remotePath, localPath } = data;
          if (!remotePath || !localPath) {
            this.postStatus('error', '✕ Provide both remote and local paths');
            return;
          }
          this.executeDeviceTask(`Pull ${remotePath}`, () => executor.pullFile(deviceId, remotePath, localPath));
          break;
        }

        case 'executeShellCommand': {
          const { shellCmd } = data;
          if (!shellCmd) {
            this.postStatus('error', '✕ Enter a shell command');
            return;
          }
          this.postStatus('loading', `⏳ Executing shell: ${shellCmd.slice(0, 25)}...`);
          try {
            const res = await executor.executeShellCommand(deviceId, shellCmd);
            this._view?.webview.postMessage({
              type: 'setShellResult',
              command: res.command,
              output: res.output
            });
            this.postStatus('success', `✓ Shell command finished`);
          } catch (e: any) {
            this.postStatus('error', `✕ Shell failed: ${e.message?.slice(0, 60)}`);
            this._view?.webview.postMessage({
              type: 'setShellResult',
              command: shellCmd,
              output: e.message || 'Error executing command'
            });
          }
          break;
        }

        case 'listDirectory': {
          const remotePath = data.remotePath || '/sdcard';
          if (!deviceId) {
            this.postStatus('error', '✕ Please select a connected device');
            return;
          }
          this.postStatus('loading', `⏳ Loading ${remotePath}...`);
          try {
            const entries = await executor.listDirectory(deviceId, remotePath);
            this._view?.webview.postMessage({
              type: 'setDirectoryContents',
              path: remotePath,
              entries
            });
            this.postStatus('success', `✓ ${remotePath}: ${entries.length} item(s)`);
          } catch (e: any) {
            this.postStatus('error', `✕ Failed to list ${remotePath}: ${e.message?.slice(0, 60)}`);
            this._view?.webview.postMessage({
              type: 'setDirectoryContents',
              path: remotePath,
              entries: []
            });
          }
          break;
        }

        case 'createDirectory': {
          const { targetDir } = data;
          if (!deviceId || !targetDir) return;
          this.executeDeviceTask(`Create Directory`, async () => {
            const res = await executor.createDirectory(deviceId, targetDir);
            const parent = path.posix.dirname(targetDir);
            const entries = await executor.listDirectory(deviceId, parent);
            this._view?.webview.postMessage({ type: 'setDirectoryContents', path: parent, entries });
            return res;
          });
          break;
        }

        case 'deleteDeviceFile': {
          const { targetPath, currentDir } = data;
          if (!deviceId || !targetPath) return;
          this.executeDeviceTask(`Delete`, async () => {
            const res = await executor.deleteDeviceFile(deviceId, targetPath);
            const refreshDir = currentDir || path.posix.dirname(targetPath);
            const entries = await executor.listDirectory(deviceId, refreshDir);
            this._view?.webview.postMessage({ type: 'setDirectoryContents', path: refreshDir, entries });
            return res;
          });
          break;
        }

        case 'previewDeviceFile': {
          const { remotePath } = data;
          if (!deviceId || !remotePath) return;
          this.postStatus('loading', `⏳ Opening ${path.posix.basename(remotePath)}...`);
          try {
            const fileName = path.posix.basename(remotePath);
            const tempLocal = path.join(os.tmpdir(), `adb_preview_${Date.now()}_${fileName}`);
            await executor.pullFile(deviceId, remotePath, tempLocal);
            const uri = vscode.Uri.file(tempLocal);
            await vscode.commands.executeCommand('vscode.open', uri);
            this.postStatus('success', `✓ Opened ${fileName}`);
          } catch (e: any) {
            this.postStatus('error', `✕ Preview failed: ${e.message?.slice(0, 60)}`);
          }
          break;
        }

        case 'downloadDeviceFile': {
          const { remotePath } = data;
          if (!deviceId || !remotePath) return;
          const fileName = path.posix.basename(remotePath);
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const defaultUri = workspaceFolder ? vscode.Uri.file(path.join(workspaceFolder, fileName)) : undefined;
          const saveUri = await vscode.window.showSaveDialog({
            defaultUri,
            saveLabel: 'Download from Device'
          });
          if (saveUri) {
            this.executeDeviceTask(`Download ${fileName}`, () => executor.pullFile(deviceId, remotePath, saveUri.fsPath));
          }
          break;
        }

        case 'uploadDeviceFile': {
          const { currentDir } = data;
          if (!deviceId) {
            this.postStatus('error', '✕ Please select a connected device');
            return;
          }
          const targetDir = currentDir || '/sdcard';
          const pickedFiles = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Upload to Device'
          });
          if (pickedFiles && pickedFiles[0]) {
            const localFsPath = pickedFiles[0].fsPath;
            const fileName = path.basename(localFsPath);
            const remoteDest = path.posix.join(targetDir, fileName);
            this.executeDeviceTask(`Upload ${fileName}`, async () => {
              const res = await executor.pushFile(deviceId, localFsPath, remoteDest);
              const entries = await executor.listDirectory(deviceId, targetDir);
              this._view?.webview.postMessage({ type: 'setDirectoryContents', path: targetDir, entries });
              return res;
            });
          }
          break;
        }
      }
    });

    // Initial scans
    setTimeout(() => {
      this.refresh();
      this.autoDetect();
    }, 300);
  }

  public refresh() {
    this._view?.webview.postMessage({ type: 'triggerRefresh' });
  }

  public autoDetect() {
    this._view?.webview.postMessage({ type: 'triggerAutoDetect' });
  }

  private postStatus(statusType: 'success' | 'error' | 'loading' | 'idle', message: string) {
    this._view?.webview.postMessage({ type: 'setStatus', statusType, message });
  }

  private async executeAppTask(title: string, action: () => Promise<string>) {
    this.postStatus('loading', `⏳ Executing ${title}...`);
    try {
      const res = await action();
      this.postStatus('success', `✓ ${title} Successful`);
    } catch (e: any) {
      this.postStatus('error', `✕ ${title} Failed: ${e.message?.slice(0, 60)}`);
    }
  }

  private async executeDeviceTask(title: string, action: () => Promise<string>) {
    this.postStatus('loading', `⏳ Executing ${title}...`);
    try {
      const res = await action();
      this.postStatus('success', `✓ ${title}: ${res}`);
    } catch (e: any) {
      this.postStatus('error', `✕ ${title} Failed: ${e.message?.slice(0, 60)}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADB Controller by Samsad</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: 12px;
    }
    body {
      background-color: var(--vscode-sideBar-background, #1e1e1e);
      color: var(--vscode-foreground, #cccccc);
      padding: 12px;
      user-select: none;
    }
    .field-group {
      margin-bottom: 10px;
    }
    .field-label {
      font-weight: 600;
      font-size: 11px;
      margin-bottom: 5px;
      display: block;
      color: var(--vscode-foreground, #e0e0e0);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .input-row {
      display: flex;
      gap: 6px;
    }
    select, input {
      flex: 1;
      height: 32px;
      background: var(--vscode-input-background, #252526);
      color: var(--vscode-input-foreground, #cccccc);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      border-radius: 6px;
      padding: 0 8px;
      outline: none;
      font-size: 12px;
      width: 100%;
    }
    select:focus, input:focus {
      border-color: var(--vscode-focusBorder, #007acc);
    }
    .btn {
      height: 32px;
      padding: 0 12px;
      background: var(--vscode-button-secondaryBackground, #313438);
      color: var(--vscode-button-secondaryForeground, #ffffff);
      border: 1px solid var(--vscode-input-border, #43464c);
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 500;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3e4147);
      border-color: var(--vscode-focusBorder, #007acc);
    }
    .btn:active {
      transform: scale(0.98);
    }
    .btn-icon {
      width: 32px;
      padding: 0;
    }
    .nav-bar {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 4px;
      margin-bottom: 12px;
    }
    .nav-btn {
      height: 30px;
      background: var(--vscode-button-secondaryBackground, #2a2c30);
      color: var(--vscode-foreground, #cccccc);
      border: 1px solid var(--vscode-input-border, #383a40);
      border-radius: 5px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    .nav-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3a3d44);
      color: #ffffff;
      border-color: #5c616b;
    }
    .card {
      background: var(--vscode-editorWidget-background, #25282c);
      border: 1px solid var(--vscode-widget-border, #393b40);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 10px;
      color: var(--vscode-foreground, #ffffff);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .grid-btn {
      height: 36px;
      background: var(--vscode-button-secondaryBackground, #32353a);
      color: var(--vscode-foreground, #dfdfdf);
      border: 1px solid var(--vscode-input-border, #3e4249);
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 11.5px;
      transition: all 0.15s ease;
    }
    .grid-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3e4147);
      border-color: #5c616b;
      color: #ffffff;
    }
    .grid-btn:active {
      transform: scale(0.97);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 11.5px;
      background: #2b2d30;
      border: 1px solid #3c3f41;
      color: #9aa0a6;
      margin-top: 4px;
    }
    .status-badge.success {
      background: #1b3828;
      border-color: #2d5a3c;
      color: #5bb974;
    }
    .status-badge.error {
      background: #3e2224;
      border-color: #5c2b2e;
      color: #f28b82;
    }
    .status-badge.loading {
      background: #1f2e45;
      border-color: #2f4870;
      color: #8ab4f8;
    }
    .pref-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      margin-bottom: 8px;
    }
    .pref-table th {
      text-align: left;
      font-size: 11px;
      padding: 4px 6px;
      color: var(--vscode-foreground, #aaaaaa);
      border-bottom: 1px solid var(--vscode-widget-border, #393b40);
    }
    .pref-table td {
      padding: 4px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .pref-table input, .pref-table select {
      height: 26px;
      font-size: 11.5px;
      padding: 0 6px;
    }
    .btn-del {
      height: 26px;
      width: 26px;
      padding: 0;
      background: transparent;
      border: 1px solid #5c2b2e;
      color: #f28b82;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-del:hover {
      background: #3e2224;
    }
    .console-box {
      background: #141619;
      border: 1px solid var(--vscode-widget-border, #393b40);
      border-radius: 6px;
      padding: 8px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      font-size: 11px;
      line-height: 1.45;
      max-height: 220px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      user-select: text;
    }
    .log-line-v { color: #7f848e; }
    .log-line-d { color: #61afef; }
    .log-line-i { color: #98c379; }
    .log-line-w { color: #e5c07b; }
    .log-line-e { color: #e06c75; font-weight: 600; }
    .log-line-f { color: #e06c75; font-weight: 700; background: rgba(224, 108, 117, 0.15); }

    .stat-badge-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .stat-badge {
      background: var(--vscode-button-secondaryBackground, #2a2c30);
      border: 1px solid var(--vscode-widget-border, #393b40);
      border-radius: 6px;
      padding: 6px 8px;
      text-align: center;
    }
    .stat-badge-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-foreground, #888);
      margin-bottom: 2px;
    }
    .stat-badge-value {
      font-size: 13px;
      font-weight: 700;
      color: #61afef;
    }
    .chip-group {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 6px;
    }
    .chip-btn {
      height: 22px;
      padding: 0 6px;
      font-size: 10px;
      background: var(--vscode-button-secondaryBackground, #2a2c30);
      border: 1px solid var(--vscode-input-border, #3e4249);
      border-radius: 4px;
      color: var(--vscode-foreground, #ccc);
      cursor: pointer;
      font-family: monospace;
      transition: all 0.15s ease;
    }
    .chip-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3a3d44);
      color: #fff;
    }
    .explorer-folder-link {
      color: #61afef;
      cursor: pointer;
      font-weight: 500;
      text-decoration: none;
    }
    .explorer-folder-link:hover {
      text-decoration: underline;
      color: #79b8ff;
    }
    .btn-xs {
      height: 22px;
      padding: 0 6px;
      font-size: 10.5px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <!-- Target Device -->
  <div class="field-group">
    <label class="field-label">Target Device</label>
    <div class="input-row">
      <select id="deviceSelect">
        <option value="">Scanning devices...</option>
      </select>
      <button class="btn btn-icon" id="refreshBtn" title="Refresh Devices">🔄</button>
    </div>
  </div>

  <!-- Package Name -->
  <div class="field-group">
    <label class="field-label">Package Name</label>
    <div class="input-row">
      <input type="text" id="pkgInput" list="packagesList" placeholder="com.example.android.myapp" />
      <datalist id="packagesList"></datalist>
      <button class="btn" id="autoDetectBtn" title="Auto Detect Package">Auto Detect</button>
    </div>
  </div>

  <!-- Virtual Navigation Bar -->
  <div class="nav-bar">
    <button class="nav-btn" data-key="4" title="Back">◀</button>
    <button class="nav-btn" data-key="3" title="Home">⏺</button>
    <button class="nav-btn" data-key="187" title="Recent Apps">⏹</button>
    <button class="nav-btn" data-key="26" title="Lock / Wake Screen">🔒</button>
    <button class="nav-btn" data-key="25" title="Volume Down">🔉</button>
    <button class="nav-btn" data-key="24" title="Volume Up">🔊</button>
  </div>

  <!-- Section 1: App Management -->
  <div class="card">
    <div class="card-title">1. App Management</div>
    <div class="grid">
      <button class="grid-btn" data-action="restartApp">🔄 Restart App</button>
      <button class="grid-btn" data-action="clearAppData">🧹 Clear App Data</button>
      <button class="grid-btn" data-action="clearAndRestartApp">✨ Clear & Restart</button>
      <button class="grid-btn" data-action="forceStopApp">🛑 Force Stop</button>
      <button class="grid-btn" data-action="uninstallApp">🗑️ Uninstall App</button>
      <button class="grid-btn" data-action="openAppInfo">⚙️ App Info</button>
    </div>
  </div>

  <!-- Section 2: Device Quick Tools -->
  <div class="card">
    <div class="card-title">2. Device Quick Tools</div>
    <div class="grid">
      <button class="grid-btn" data-action="screenshot">📸 Screenshot</button>
      <button class="grid-btn" id="darkModeBtn" data-action="toggleDarkMode">🌗 Dark Mode</button>
      <button class="grid-btn" data-action="toggleLayoutBounds">📐 Layout Bounds</button>
      <button class="grid-btn" data-action="toggleAnimations">⚡ Animations</button>
    </div>
  </div>

  <!-- Section 3: Battery & Doze Simulator (Moved to Position 3) -->
  <div class="card">
    <div class="card-title">3. Battery & Doze Simulator</div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 8px;">
      <button class="nav-btn battery-btn" data-level="5" title="Set Battery to 5% (Critical)">🪫 5%</button>
      <button class="nav-btn battery-btn" data-level="20" title="Set Battery to 20% (Low)">🔋 20%</button>
      <button class="nav-btn battery-btn" data-level="50" title="Set Battery to 50%">🔋 50%</button>
      <button class="nav-btn battery-btn" data-level="100" title="Set Battery to 100% (Full)">⚡ 100%</button>
    </div>
    <div class="grid">
      <button class="grid-btn" data-action="unplugBattery">🔌 Unplug (Discharge)</button>
      <button class="grid-btn" data-action="resetBattery">🔄 Reset Battery</button>
      <button class="grid-btn" data-action="forceDozeMode">💤 Enter Doze (Idle)</button>
      <button class="grid-btn" data-action="exitDozeMode">☀️ Exit Doze</button>
      <button class="grid-btn" data-action="setAppInactive">⏳ App Standby</button>
    </div>
  </div>

  <!-- Section 4: App Data, SharedPreferences & Database Inspector -->
  <div class="card">
    <div class="card-title">4. App Data & Database Live Inspector</div>
    <div style="display: flex; gap: 4px; margin-bottom: 8px;">
      <button class="nav-btn" id="subtabPrefBtn" style="flex: 1; height: 26px; font-size: 11px; background: var(--vscode-button-secondaryHoverBackground, #3a3d44); color: #fff;">📝 SharedPrefs</button>
      <button class="nav-btn" id="subtabDbBtn" style="flex: 1; height: 26px; font-size: 11px;">🗄️ Database Live</button>
    </div>

    <!-- SharedPreferences Tab Pane -->
    <div id="sharedPrefsPane">
      <div style="display: flex; gap: 6px; margin-bottom: 8px;">
        <select id="prefFileSelect">
          <option value="">(Select SharedPreferences file)</option>
        </select>
        <button class="btn btn-icon" id="reloadPrefFilesBtn" title="Load / Refresh Files">🔄</button>
      </div>
      
      <div id="prefEditorContainer" style="display: none;">
        <table class="pref-table">
          <thead>
            <tr>
              <th style="width: 35%;">Key</th>
              <th style="width: 25%;">Type</th>
              <th style="width: 32%;">Value</th>
              <th style="width: 8%;"></th>
            </tr>
          </thead>
          <tbody id="prefTableBody">
          </tbody>
        </table>
        <div style="display: flex; gap: 6px; margin-bottom: 10px;">
          <button class="btn" id="addPrefRowBtn" style="font-size: 11px; height: 28px;">➕ Add Key</button>
        </div>
        <div class="grid" style="margin-bottom: 8px;">
          <button class="grid-btn" id="savePrefBtn">💾 Save Changes</button>
          <button class="grid-btn" id="saveRestartPrefBtn">⚡ Save & Restart</button>
        </div>
      </div>
    </div>

    <!-- Database Inspector Tab Pane -->
    <div id="databaseInspectorPane" style="display: none;">
      <div style="display: flex; gap: 6px; margin-bottom: 6px;">
        <select id="dbSelect" style="flex: 1;">
          <option value="">(Select Database)</option>
        </select>
        <button class="btn btn-icon" id="reloadDbsBtn" title="Refresh Databases">🔄</button>
      </div>
      <div style="display: flex; gap: 6px; margin-bottom: 8px;">
        <select id="tableSelect" style="flex: 1;">
          <option value="">(Select Table)</option>
        </select>
        <button class="btn btn-icon" id="reloadTableDataBtn" title="Reload Table Data">🔄</button>
      </div>

      <!-- Table View -->
      <div id="dbTableContainer" style="display: none; max-height: 180px; overflow-y: auto; margin-bottom: 8px;">
        <table class="pref-table" id="dbDataTable">
          <thead id="dbTableHead"></thead>
          <tbody id="dbTableBody"></tbody>
        </table>
      </div>

      <!-- SQL Console -->
      <div style="margin-top: 8px; border-top: 1px solid var(--vscode-widget-border, #393b40); padding-top: 8px;">
        <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--vscode-foreground, #ccc);">⚡ SQL Query Console</div>
        <textarea id="sqlQueryInput" rows="2" style="width: 100%; box-sizing: border-box; font-family: monospace; font-size: 11.5px; padding: 4px 6px; background: var(--vscode-input-background, #1e1e1e); color: var(--vscode-input-foreground, #fff); border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 4px; resize: vertical;" placeholder="SELECT * FROM table LIMIT 20;"></textarea>
        <div style="display: flex; gap: 4px; margin-top: 4px; margin-bottom: 6px;">
          <button class="btn" id="sqlQuickSelectBtn" style="font-size: 10.5px; height: 24px; padding: 0 6px;">SELECT *</button>
          <button class="btn" id="sqlQuickCountBtn" style="font-size: 10.5px; height: 24px; padding: 0 6px;">COUNT(*)</button>
          <div style="flex: 1;"></div>
          <button class="btn" id="runSqlBtn" style="font-size: 10.5px; height: 24px; padding: 0 10px; font-weight: 600; background: var(--vscode-button-background, #0e639c);">▶ Run SQL</button>
        </div>
        <div id="sqlResultContainer" style="display: none; max-height: 140px; overflow: auto; margin-bottom: 8px;">
          <table class="pref-table" id="sqlResultTable">
            <thead id="sqlResultHead"></thead>
            <tbody id="sqlResultBody"></tbody>
          </table>
        </div>
      </div>

      <div class="grid" style="margin-top: 6px; margin-bottom: 8px;">
        <button class="grid-btn" id="dbAddRowBtn">➕ Insert Row</button>
        <button class="grid-btn" id="dbRestartAppBtn">⚡ Save & Restart</button>
      </div>
    </div>

    <div style="margin-top: 6px;">
      <button class="grid-btn" style="width: 100%;" data-action="exportAppData">💾 Export SQLite DBs & App Data</button>
    </div>
  </div>

  <!-- Section 5: Deep Link Tester -->
  <div class="card">
    <div class="card-title">5. Deep Link & URL Tester</div>
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <input type="text" id="deepLinkInput" placeholder="myapp://checkout?id=101 or https://example.com/promo" />
      <button class="btn" id="openDeepLinkBtn">🚀 Open Deep Link</button>
    </div>
  </div>

  <!-- Section 6: Broadcast Tester -->
  <div class="card">
    <div class="card-title">6. Broadcast & Intent Tester</div>
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <input type="text" id="broadcastActionInput" placeholder="Action: e.g. com.example.CUSTOM_NOTIFICATION" />
      <input type="text" id="broadcastExtraInput" placeholder="Extra (Key=Value): e.g. title=Hello World" />
      <button class="btn" id="sendBroadcastBtn">📢 Send Broadcast</button>
    </div>
  </div>

  <!-- Section 7: Diagnostics & Performance -->
  <div class="card">
    <div class="card-title">7. Diagnostics & Memory Profiler</div>
    <div style="display: flex; gap: 4px; margin-bottom: 8px;">
      <button class="nav-btn" id="subtabLogcatBtn" style="flex: 1; height: 26px; font-size: 11px; background: var(--vscode-button-secondaryHoverBackground, #3a3d44); color: #fff;">📋 Logcat</button>
      <button class="nav-btn" id="subtabMemoryBtn" style="flex: 1; height: 26px; font-size: 11px;">📊 Memory</button>
    </div>

    <!-- Logcat Pane -->
    <div id="logcatPane">
      <div style="display: grid; grid-template-columns: 85px 1fr; gap: 6px; margin-bottom: 6px;">
        <select id="logLevelSelect" style="height: 28px; font-size: 11px;">
          <option value="">Level: ALL</option>
          <option value="V">Verbose (V)</option>
          <option value="D">Debug (D)</option>
          <option value="I">Info (I)</option>
          <option value="W">Warn (W)</option>
          <option value="E">Error (E)</option>
          <option value="F">Fatal (F)</option>
        </select>
        <input type="text" id="logTagInput" placeholder="Tag filter (e.g. ActivityTaskManager)" style="height: 28px; font-size: 11px;" />
      </div>
      <div style="display: grid; grid-template-columns: 1fr 60px; gap: 6px; margin-bottom: 6px;">
        <input type="text" id="logSearchInput" placeholder="Search text..." style="height: 28px; font-size: 11px;" />
        <input type="number" id="logLinesInput" value="100" min="10" max="1000" title="Max Lines" style="height: 28px; font-size: 11px; text-align: center;" />
      </div>
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
        <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer; color: var(--vscode-foreground, #ccc);">
          <input type="checkbox" id="logPkgFilterCheck" style="width: auto; height: auto;" checked />
          Filter by Selected Package
        </label>
      </div>
      <div class="grid" style="margin-bottom: 8px;">
        <button class="grid-btn" id="dumpLogcatBtn">▶ Dump Logcat</button>
        <button class="grid-btn" id="clearLogcatBtn">🧹 Clear Buffer</button>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span id="logcatCountLabel" style="font-size: 10.5px; color: var(--vscode-foreground, #888);">0 lines</span>
        <button class="btn" id="copyLogcatBtn" style="font-size: 10.5px; height: 22px; padding: 0 8px;">📋 Copy Logs</button>
      </div>
      <div id="logcatOutput" class="console-box" style="display: none;"></div>
    </div>

    <!-- Memory Profiler Pane -->
    <div id="memoryPane" style="display: none;">
      <div style="margin-bottom: 8px;">
        <button class="grid-btn" id="inspectMemoryBtn" style="width: 100%;">📊 Profile App Memory (dumpsys)</button>
      </div>
      <div id="memoryResultsContainer" style="display: none;">
        <div class="stat-badge-grid">
          <div class="stat-badge">
            <div class="stat-badge-label">Total PSS</div>
            <div class="stat-badge-value" id="memPssVal">0 MB</div>
          </div>
          <div class="stat-badge">
            <div class="stat-badge-label">Total RSS</div>
            <div class="stat-badge-value" id="memRssVal">0 MB</div>
          </div>
          <div class="stat-badge">
            <div class="stat-badge-label">Java Heap</div>
            <div class="stat-badge-value" id="memJavaVal">0 KB</div>
          </div>
          <div class="stat-badge">
            <div class="stat-badge-label">Native Heap</div>
            <div class="stat-badge-value" id="memNativeVal">0 KB</div>
          </div>
          <div class="stat-badge">
            <div class="stat-badge-label">Graphics</div>
            <div class="stat-badge-value" id="memGraphicsVal">0 KB</div>
          </div>
          <div class="stat-badge">
            <div class="stat-badge-label">Code / Stack</div>
            <div class="stat-badge-value" id="memCodeVal">0 KB</div>
          </div>
        </div>
        <div style="font-size: 10.5px; font-weight: 600; color: var(--vscode-foreground, #aaa); margin-bottom: 4px;">Raw Memory Dump:</div>
        <div id="memoryRawOutput" class="console-box" style="max-height: 120px;"></div>
      </div>
    </div>
  </div>

  <!-- Section 8: File Explorer, Transfers & ADB Shell -->
  <div class="card">
    <div class="card-title">8. Device File Explorer & ADB Shell</div>
    <div style="display: flex; gap: 4px; margin-bottom: 8px;">
      <button class="nav-btn" id="subtabExplorerBtn" style="flex: 1; height: 26px; font-size: 11px; background: var(--vscode-button-secondaryHoverBackground, #3a3d44); color: #fff;">📁 Explorer</button>
      <button class="nav-btn" id="subtabFileBtn" style="flex: 1; height: 26px; font-size: 11px;">⬆️ Transfers</button>
      <button class="nav-btn" id="subtabShellBtn" style="flex: 1; height: 26px; font-size: 11px;">⚡ Shell</button>
    </div>

    <!-- Device File Explorer Pane -->
    <div id="explorerPane">
      <div style="display: flex; gap: 4px; margin-bottom: 6px;">
        <input type="text" id="explorerPathInput" value="/sdcard" style="height: 28px; font-size: 11px; font-family: monospace;" placeholder="/sdcard" />
        <button class="btn" id="explorerUpBtn" title="Go up to parent directory" style="height: 28px; padding: 0 8px; font-size: 11px;">⬆ Up</button>
        <button class="btn btn-icon" id="explorerRefreshBtn" title="Refresh Directory" style="height: 28px; width: 28px;">🔄</button>
      </div>

      <!-- Quick Bookmarks -->
      <div class="chip-group" style="margin-bottom: 6px;">
        <button class="chip-btn explorer-bookmark" data-path="/sdcard">📱 /sdcard</button>
        <button class="chip-btn explorer-bookmark" data-path="/sdcard/Download">📥 Downloads</button>
        <button class="chip-btn explorer-bookmark" data-path="/sdcard/DCIM">📸 DCIM</button>
        <button class="chip-btn explorer-bookmark" data-path="/sdcard/Pictures">🖼️ Pictures</button>
        <button class="chip-btn explorer-bookmark" data-path="/data/local/tmp">📂 tmp</button>
      </div>

      <div style="display: flex; gap: 6px; margin-bottom: 6px;">
        <button class="btn btn-xs" id="explorerNewFolderBtn" style="flex: 1;">➕ New Folder</button>
        <button class="btn btn-xs" id="explorerUploadBtn" style="flex: 1;">⬆️ Upload File</button>
      </div>

      <!-- File Table -->
      <div id="explorerTableContainer" style="max-height: 220px; overflow-y: auto; border: 1px solid var(--vscode-widget-border, #393b40); border-radius: 6px; background: var(--vscode-input-background, #1e1e1e);">
        <table class="pref-table" style="margin: 0;">
          <thead>
            <tr>
              <th style="width: 52%;">Name</th>
              <th style="width: 22%; text-align: right;">Size</th>
              <th style="width: 26%; text-align: center;">Actions</th>
            </tr>
          </thead>
          <tbody id="explorerTableBody">
            <tr>
              <td colspan="3" style="text-align: center; color: #888; padding: 12px;">Select a connected device to explore files</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- File Transfers Pane -->
    <div id="fileTransferPane" style="display: none;">
      <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--vscode-foreground, #ccc);">⬆️ Push File (Local ➔ Device)</div>
      <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;">
        <input type="text" id="pushLocalInput" placeholder="Local path (e.g. ./app.apk or /tmp/test.txt)" style="height: 28px; font-size: 11px;" />
        <input type="text" id="pushRemoteInput" placeholder="Remote path (e.g. /sdcard/Download/test.txt)" style="height: 28px; font-size: 11px;" />
        <button class="btn" id="pushFileBtn" style="height: 28px; font-size: 11px;">⬆️ Push to Device</button>
      </div>

      <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--vscode-foreground, #ccc); border-top: 1px solid var(--vscode-widget-border, #393b40); padding-top: 8px;">⬇️ Pull File (Device ➔ Local)</div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <input type="text" id="pullRemoteInput" placeholder="Remote path (e.g. /sdcard/Download/test.txt)" style="height: 28px; font-size: 11px;" />
        <input type="text" id="pullLocalInput" placeholder="Local dest path (e.g. ./downloaded_file.txt)" style="height: 28px; font-size: 11px;" />
        <button class="btn" id="pullFileBtn" style="height: 28px; font-size: 11px;">⬇️ Pull from Device</button>
      </div>
    </div>

    <!-- Quick Shell Pane -->
    <div id="shellPane" style="display: none;">
      <div style="font-size: 10.5px; font-weight: 600; color: var(--vscode-foreground, #888); margin-bottom: 4px;">Quick Presets:</div>
      <div class="chip-group">
        <button class="chip-btn" data-cmd="pm list packages -3">3rd-party pkgs</button>
        <button class="chip-btn" data-cmd="getprop ro.build.version.release">Android OS Ver</button>
        <button class="chip-btn" data-cmd="df -h /data">Storage /data</button>
        <button class="chip-btn" data-cmd="dumpsys battery">Battery dump</button>
        <button class="chip-btn" data-cmd="ip addr show wlan0">Wi-Fi IP</button>
      </div>
      <div style="display: flex; gap: 6px; margin-bottom: 6px;">
        <input type="text" id="shellCmdInput" placeholder="adb shell command..." style="height: 28px; font-size: 11px; font-family: monospace;" />
        <button class="btn" id="runShellBtn" style="height: 28px; font-size: 11px; padding: 0 10px; font-weight: 600; background: var(--vscode-button-background, #0e639c);">▶ Run</button>
      </div>
      <div id="shellResultContainer" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-size: 10.5px; color: var(--vscode-foreground, #888);">Output:</span>
          <button class="btn" id="copyShellBtn" style="font-size: 10.5px; height: 22px; padding: 0 8px;">📋 Copy</button>
        </div>
        <div id="shellOutput" class="console-box"></div>
      </div>
    </div>
  </div>

  <!-- Status Pill -->
  <div>
    <div id="statusBadge" class="status-badge">ℹ️ Ready</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const deviceSelect = document.getElementById('deviceSelect');
    const refreshBtn = document.getElementById('refreshBtn');
    const pkgInput = document.getElementById('pkgInput');
    const packagesList = document.getElementById('packagesList');
    const autoDetectBtn = document.getElementById('autoDetectBtn');
    const statusBadge = document.getElementById('statusBadge');
    const deepLinkInput = document.getElementById('deepLinkInput');
    const openDeepLinkBtn = document.getElementById('openDeepLinkBtn');
    const broadcastActionInput = document.getElementById('broadcastActionInput');
    const broadcastExtraInput = document.getElementById('broadcastExtraInput');
    const sendBroadcastBtn = document.getElementById('sendBroadcastBtn');
    const darkModeBtn = document.getElementById('darkModeBtn');
    const prefFileSelect = document.getElementById('prefFileSelect');
    const reloadPrefFilesBtn = document.getElementById('reloadPrefFilesBtn');
    const prefEditorContainer = document.getElementById('prefEditorContainer');
    const prefTableBody = document.getElementById('prefTableBody');
    const addPrefRowBtn = document.getElementById('addPrefRowBtn');
    const savePrefBtn = document.getElementById('savePrefBtn');
    const saveRestartPrefBtn = document.getElementById('saveRestartPrefBtn');

    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'refreshDevices' });
    });

    deviceSelect.addEventListener('change', () => {
      const deviceId = deviceSelect.value;
      if (deviceId) {
        vscode.postMessage({ command: 'deviceChanged', deviceId });
      }
    });

    autoDetectBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'autoDetectPackage' });
    });

    // SharedPreferences Editor events
    reloadPrefFilesBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (!deviceId || !packageName) {
        setStatus('error', '✕ Select a device and package first');
        return;
      }
      vscode.postMessage({ command: 'getSharedPrefsFiles', deviceId, packageName });
    });

    prefFileSelect.addEventListener('change', () => {
      const fileName = prefFileSelect.value;
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (fileName && deviceId && packageName) {
        vscode.postMessage({ command: 'readSharedPrefsXml', deviceId, packageName, fileName });
      } else {
        prefEditorContainer.style.display = 'none';
      }
    });

    addPrefRowBtn.addEventListener('click', () => {
      addTableRow('new_key_' + (prefTableBody.children.length + 1), 'string', 'value');
    });

    savePrefBtn.addEventListener('click', () => {
      saveSharedPrefs(false);
    });

    saveRestartPrefBtn.addEventListener('click', () => {
      saveSharedPrefs(true);
    });

    function addTableRow(key, type, val) {
      const tr = document.createElement('tr');
      const optStr = ['string', 'boolean', 'int', 'long', 'float', 'set'].map(t => 
        '<option value="' + t + '" ' + (type === t ? 'selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>'
      ).join('');

      tr.innerHTML = '<td><input type="text" class="pref-key" value="' + escapeHtml(key) + '" /></td>' +
        '<td><select class="pref-type">' + optStr + '</select></td>' +
        '<td><input type="text" class="pref-val" value="' + escapeHtml(val) + '" /></td>' +
        '<td><button class="btn-del" title="Delete Key">✕</button></td>';

      tr.querySelector('.btn-del').addEventListener('click', () => tr.remove());
      prefTableBody.appendChild(tr);
    }

    function parseXmlEntries(xml) {
      const entries = [];
      const stringRegex = /<string\\s+name="([^"]+)">([\\s\\S]*?)<\\/string>/g;
      let m;
      while ((m = stringRegex.exec(xml)) !== null) {
        entries.push({ key: m[1], type: 'string', value: m[2] });
      }
      const boolRegex = /<boolean\\s+name="([^"]+)"\\s+value="([^"]+)"\\s*\\/>/g;
      while ((m = boolRegex.exec(xml)) !== null) {
        entries.push({ key: m[1], type: 'boolean', value: m[2] });
      }
      const intRegex = /<int\\s+name="([^"]+)"\\s+value="([^"]+)"\\s*\\/>/g;
      while ((m = intRegex.exec(xml)) !== null) {
        entries.push({ key: m[1], type: 'int', value: m[2] });
      }
      const longRegex = /<long\\s+name="([^"]+)"\\s+value="([^"]+)"\\s*\\/>/g;
      while ((m = longRegex.exec(xml)) !== null) {
        entries.push({ key: m[1], type: 'long', value: m[2] });
      }
      const floatRegex = /<float\\s+name="([^"]+)"\\s+value="([^"]+)"\\s*\\/>/g;
      while ((m = floatRegex.exec(xml)) !== null) {
        entries.push({ key: m[1], type: 'float', value: m[2] });
      }
      const setRegex = /<set\\s+name="([^"]+)">([\\s\\S]*?)<\\/set>/g;
      while ((m = setRegex.exec(xml)) !== null) {
        const inners = [];
        const itemRegex = /<string>([\\s\\S]*?)<\\/string>/g;
        let item;
        while ((item = itemRegex.exec(m[2])) !== null) {
          inners.push(item[1]);
        }
        entries.push({ key: m[1], type: 'set', value: inners.join(',') });
      }
      return entries.sort((a, b) => a.key.localeCompare(b.key));
    }

    function serializeEntriesToXml() {
      let xml = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\\n<map>\\n";
      const rows = prefTableBody.querySelectorAll('tr');
      rows.forEach(row => {
        const k = row.querySelector('.pref-key').value.trim();
        const type = row.querySelector('.pref-type').value;
        const v = row.querySelector('.pref-val').value;
        if (!k) return;
        if (type === 'boolean') {
          xml += '    <boolean name="' + k + '" value="' + (v.toLowerCase() === 'true') + '" />\\n';
        } else if (type === 'int') {
          xml += '    <int name="' + k + '" value="' + (parseInt(v) || 0) + '" />\\n';
        } else if (type === 'long') {
          xml += '    <long name="' + k + '" value="' + (parseInt(v) || 0) + '" />\\n';
        } else if (type === 'float') {
          xml += '    <float name="' + k + '" value="' + (parseFloat(v) || 0.0) + '" />\\n';
        } else if (type === 'set') {
          xml += '    <set name="' + k + '">\\n';
          v.split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
            xml += '        <string>' + s + '</string>\\n';
          });
          xml += '    </set>\\n';
        } else {
          xml += '    <string name="' + k + '">' + v + '</string>\\n';
        }
      });
      xml += "</map>\\n";
      return xml;
    }

    function saveSharedPrefs(restart) {
      const fileName = prefFileSelect.value;
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (!fileName || !deviceId || !packageName) {
        setStatus('error', '✕ No file selected');
        return;
      }
      const xmlContent = serializeEntriesToXml();
      vscode.postMessage({ command: 'saveSharedPrefsXml', deviceId, packageName, fileName, xmlContent, restart });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Navigation buttons. Match on data-key so the sub-tab buttons, which also carry
    // .nav-btn but no key, never fire a keyevent with a NaN code.
    document.querySelectorAll('.nav-btn[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const keyCode = parseInt(btn.getAttribute('data-key'));
        const deviceId = deviceSelect.value;
        if (!deviceId) {
          setStatus('error', '✕ Please select a connected device');
          return;
        }
        vscode.postMessage({ command: 'sendKeyEvent', deviceId, keyCode });
      });
    });

    // Battery preset buttons
    document.querySelectorAll('.battery-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const level = parseInt(btn.getAttribute('data-level'));
        const deviceId = deviceSelect.value;
        if (!deviceId) {
          setStatus('error', '✕ Please select a connected device');
          return;
        }
        vscode.postMessage({ command: 'setBatteryLevel', deviceId, level });
      });
    });

    // App & Device tool grid buttons
    document.querySelectorAll('.grid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (!action) return;
        const deviceId = deviceSelect.value;
        const packageName = pkgInput.value.trim();

        if (!deviceId) {
          setStatus('error', '✕ Please connect and select a device');
          return;
        }

        const requiresPkg = ['restartApp', 'clearAppData', 'clearAndRestartApp', 'forceStopApp', 'uninstallApp', 'openAppInfo', 'exportAppData', 'setAppInactive'].includes(action);
        if (requiresPkg && !packageName) {
          setStatus('error', '✕ Please enter or detect a Package Name');
          return;
        }

        vscode.postMessage({ command: action, deviceId, packageName });
      });
    });

    // Deep link button
    openDeepLinkBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      const url = deepLinkInput.value.trim();
      const packageName = pkgInput.value.trim();
      if (!deviceId) {
        setStatus('error', '✕ Please select a connected device');
        return;
      }
      if (!url) {
        setStatus('error', '✕ Please enter a Deep Link URL');
        return;
      }
      vscode.postMessage({ command: 'sendDeepLink', deviceId, url, packageName });
    });

    // Broadcast button
    sendBroadcastBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      const action = broadcastActionInput.value.trim();
      const extra = broadcastExtraInput.value.trim();
      const packageName = pkgInput.value.trim();
      if (!deviceId) {
        setStatus('error', '✕ Please select a connected device');
        return;
      }
      if (!action) {
        setStatus('error', '✕ Please enter an Action name');
        return;
      }
      let extraKey = '';
      let extraVal = '';
      if (extra.includes('=')) {
        const parts = extra.split('=');
        extraKey = parts[0].trim();
        extraVal = parts.slice(1).join('=').trim();
      }
      vscode.postMessage({ command: 'sendBroadcast', deviceId, action, extraKey, extraVal, packageName });
    });

    function setStatus(type, message) {
      statusBadge.className = 'status-badge ' + (type || '');
      statusBadge.textContent = message;
    }

    // Sub-tab switcher
    const subtabPrefBtn = document.getElementById('subtabPrefBtn');
    const subtabDbBtn = document.getElementById('subtabDbBtn');
    const sharedPrefsPane = document.getElementById('sharedPrefsPane');
    const databaseInspectorPane = document.getElementById('databaseInspectorPane');

    subtabPrefBtn.addEventListener('click', () => {
      subtabPrefBtn.style.background = 'var(--vscode-button-secondaryHoverBackground, #3a3d44)';
      subtabPrefBtn.style.color = '#fff';
      subtabDbBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabDbBtn.style.color = 'var(--vscode-foreground, #ccc)';
      sharedPrefsPane.style.display = 'block';
      databaseInspectorPane.style.display = 'none';
    });

    subtabDbBtn.addEventListener('click', () => {
      subtabDbBtn.style.background = 'var(--vscode-button-secondaryHoverBackground, #3a3d44)';
      subtabDbBtn.style.color = '#fff';
      subtabPrefBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabPrefBtn.style.color = 'var(--vscode-foreground, #ccc)';
      sharedPrefsPane.style.display = 'none';
      databaseInspectorPane.style.display = 'block';
      loadDatabases();
    });

    // Database Inspector Elements
    const dbSelect = document.getElementById('dbSelect');
    const tableSelect = document.getElementById('tableSelect');
    const reloadDbsBtn = document.getElementById('reloadDbsBtn');
    const reloadTableDataBtn = document.getElementById('reloadTableDataBtn');
    const dbTableContainer = document.getElementById('dbTableContainer');
    const dbTableHead = document.getElementById('dbTableHead');
    const dbTableBody = document.getElementById('dbTableBody');
    const dbAddRowBtn = document.getElementById('dbAddRowBtn');
    const dbRestartAppBtn = document.getElementById('dbRestartAppBtn');
    const sqlQueryInput = document.getElementById('sqlQueryInput');
    const sqlQuickSelectBtn = document.getElementById('sqlQuickSelectBtn');
    const sqlQuickCountBtn = document.getElementById('sqlQuickCountBtn');
    const runSqlBtn = document.getElementById('runSqlBtn');
    const sqlResultContainer = document.getElementById('sqlResultContainer');
    const sqlResultHead = document.getElementById('sqlResultHead');
    const sqlResultBody = document.getElementById('sqlResultBody');

    let currentDbSchema = [];
    let currentDbColumns = [];

    function loadDatabases() {
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (!deviceId || !packageName) {
        setStatus('error', '✕ Select a device and package first');
        return;
      }
      vscode.postMessage({ command: 'getDatabaseFiles', deviceId, packageName });
    }

    reloadDbsBtn.addEventListener('click', loadDatabases);

    dbSelect.addEventListener('change', () => {
      const dbName = dbSelect.value;
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (dbName && deviceId && packageName) {
        vscode.postMessage({ command: 'getDatabaseTables', deviceId, packageName, dbName });
      }
    });

    tableSelect.addEventListener('change', () => {
      loadCurrentTableData();
    });

    reloadTableDataBtn.addEventListener('click', () => {
      loadCurrentTableData();
    });

    function loadCurrentTableData() {
      const dbName = dbSelect.value;
      const tableName = tableSelect.value;
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (dbName && tableName && deviceId && packageName) {
        vscode.postMessage({ command: 'getTableData', deviceId, packageName, dbName, tableName });
      }
    }

    dbAddRowBtn.addEventListener('click', () => {
      const dbName = dbSelect.value;
      const tableName = tableSelect.value;
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (!dbName || !tableName || !deviceId || !packageName) return;
      vscode.postMessage({
        command: 'executeSqlQuery',
        deviceId,
        packageName,
        dbName,
        sql: 'INSERT INTO [' + tableName + '] DEFAULT VALUES;'
      });
      setTimeout(loadCurrentTableData, 400);
    });

    dbRestartAppBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (deviceId && packageName) {
        vscode.postMessage({ command: 'restartApp', deviceId, packageName });
      }
    });

    sqlQuickSelectBtn.addEventListener('click', () => {
      const tbl = tableSelect.value || 'users';
      sqlQueryInput.value = 'SELECT * FROM [' + tbl + '] LIMIT 50;';
      runSqlQuery();
    });

    sqlQuickCountBtn.addEventListener('click', () => {
      const tbl = tableSelect.value || 'users';
      sqlQueryInput.value = 'SELECT count(*) AS total_rows FROM [' + tbl + '];';
      runSqlQuery();
    });

    runSqlBtn.addEventListener('click', runSqlQuery);

    sqlQueryInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        runSqlQuery();
        e.preventDefault();
      }
    });

    function runSqlQuery() {
      const dbName = dbSelect.value;
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      const sql = sqlQueryInput.value.trim();
      if (!dbName || !deviceId || !packageName) {
        setStatus('error', '✕ Select device, package, and database first');
        return;
      }
      if (!sql) {
        setStatus('error', '✕ Enter a SQL statement');
        return;
      }
      vscode.postMessage({ command: 'executeSqlQuery', deviceId, packageName, dbName, sql });
    }

    // Section 7: Diagnostics & Memory Switcher & Controls
    const subtabLogcatBtn = document.getElementById('subtabLogcatBtn');
    const subtabMemoryBtn = document.getElementById('subtabMemoryBtn');
    const logcatPane = document.getElementById('logcatPane');
    const memoryPane = document.getElementById('memoryPane');

    subtabLogcatBtn.addEventListener('click', () => {
      subtabLogcatBtn.style.background = 'var(--vscode-button-secondaryHoverBackground, #3a3d44)';
      subtabLogcatBtn.style.color = '#fff';
      subtabMemoryBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabMemoryBtn.style.color = 'var(--vscode-foreground, #ccc)';
      logcatPane.style.display = 'block';
      memoryPane.style.display = 'none';
    });

    subtabMemoryBtn.addEventListener('click', () => {
      subtabMemoryBtn.style.background = 'var(--vscode-button-secondaryHoverBackground, #3a3d44)';
      subtabMemoryBtn.style.color = '#fff';
      subtabLogcatBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabLogcatBtn.style.color = 'var(--vscode-foreground, #ccc)';
      logcatPane.style.display = 'none';
      memoryPane.style.display = 'block';
    });

    const logLevelSelect = document.getElementById('logLevelSelect');
    const logTagInput = document.getElementById('logTagInput');
    const logSearchInput = document.getElementById('logSearchInput');
    const logLinesInput = document.getElementById('logLinesInput');
    const logPkgFilterCheck = document.getElementById('logPkgFilterCheck');
    const dumpLogcatBtn = document.getElementById('dumpLogcatBtn');
    const clearLogcatBtn = document.getElementById('clearLogcatBtn');
    const copyLogcatBtn = document.getElementById('copyLogcatBtn');
    const logcatCountLabel = document.getElementById('logcatCountLabel');
    const logcatOutput = document.getElementById('logcatOutput');

    dumpLogcatBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (!deviceId) {
        setStatus('error', '✕ Please select a connected device');
        return;
      }
      const logLevel = logLevelSelect.value;
      const tag = logTagInput.value.trim();
      const search = logSearchInput.value.trim();
      const lineLimit = parseInt(logLinesInput.value) || 100;
      const filterByPackage = logPkgFilterCheck.checked;
      vscode.postMessage({
        command: 'getLogcat',
        deviceId,
        packageName,
        logLevel,
        tag,
        search,
        lineLimit,
        filterByPackage
      });
    });

    clearLogcatBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      if (!deviceId) {
        setStatus('error', '✕ Please select a connected device');
        return;
      }
      vscode.postMessage({ command: 'clearLogcat', deviceId });
      logcatOutput.innerHTML = '';
      logcatOutput.style.display = 'none';
      logcatCountLabel.textContent = '0 lines';
    });

    copyLogcatBtn.addEventListener('click', () => {
      const text = logcatOutput.innerText;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        setStatus('success', '✓ Logcat copied to clipboard');
      });
    });

    const inspectMemoryBtn = document.getElementById('inspectMemoryBtn');
    const memoryResultsContainer = document.getElementById('memoryResultsContainer');
    const memPssVal = document.getElementById('memPssVal');
    const memRssVal = document.getElementById('memRssVal');
    const memJavaVal = document.getElementById('memJavaVal');
    const memNativeVal = document.getElementById('memNativeVal');
    const memGraphicsVal = document.getElementById('memGraphicsVal');
    const memCodeVal = document.getElementById('memCodeVal');
    const memoryRawOutput = document.getElementById('memoryRawOutput');

    inspectMemoryBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      const packageName = pkgInput.value.trim();
      if (!deviceId || !packageName) {
        setStatus('error', '✕ Select a device and package first');
        return;
      }
      vscode.postMessage({ command: 'getAppMemory', deviceId, packageName });
    });

    // Section 8: File Explorer, Transfers & Shell Switcher & Controls
    const subtabExplorerBtn = document.getElementById('subtabExplorerBtn');
    const subtabFileBtn = document.getElementById('subtabFileBtn');
    const subtabShellBtn = document.getElementById('subtabShellBtn');
    const explorerPane = document.getElementById('explorerPane');
    const fileTransferPane = document.getElementById('fileTransferPane');
    const shellPane = document.getElementById('shellPane');

    subtabExplorerBtn.addEventListener('click', () => {
      subtabExplorerBtn.style.background = 'var(--vscode-button-secondaryHoverBackground, #3a3d44)';
      subtabExplorerBtn.style.color = '#fff';
      subtabFileBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabFileBtn.style.color = 'var(--vscode-foreground, #ccc)';
      subtabShellBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabShellBtn.style.color = 'var(--vscode-foreground, #ccc)';
      explorerPane.style.display = 'block';
      fileTransferPane.style.display = 'none';
      shellPane.style.display = 'none';
      loadExplorerDirectory();
    });

    subtabFileBtn.addEventListener('click', () => {
      subtabFileBtn.style.background = 'var(--vscode-button-secondaryHoverBackground, #3a3d44)';
      subtabFileBtn.style.color = '#fff';
      subtabExplorerBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabExplorerBtn.style.color = 'var(--vscode-foreground, #ccc)';
      subtabShellBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabShellBtn.style.color = 'var(--vscode-foreground, #ccc)';
      explorerPane.style.display = 'none';
      fileTransferPane.style.display = 'block';
      shellPane.style.display = 'none';
    });

    subtabShellBtn.addEventListener('click', () => {
      subtabShellBtn.style.background = 'var(--vscode-button-secondaryHoverBackground, #3a3d44)';
      subtabShellBtn.style.color = '#fff';
      subtabExplorerBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabExplorerBtn.style.color = 'var(--vscode-foreground, #ccc)';
      subtabFileBtn.style.background = 'var(--vscode-button-secondaryBackground, #2a2c30)';
      subtabFileBtn.style.color = 'var(--vscode-foreground, #ccc)';
      explorerPane.style.display = 'none';
      fileTransferPane.style.display = 'none';
      shellPane.style.display = 'block';
    });

    // Explorer Elements & Logic
    const explorerPathInput = document.getElementById('explorerPathInput');
    const explorerUpBtn = document.getElementById('explorerUpBtn');
    const explorerRefreshBtn = document.getElementById('explorerRefreshBtn');
    const explorerNewFolderBtn = document.getElementById('explorerNewFolderBtn');
    const explorerUploadBtn = document.getElementById('explorerUploadBtn');
    const explorerTableBody = document.getElementById('explorerTableBody');

    function loadExplorerDirectory(targetPath) {
      const deviceId = deviceSelect.value;
      if (!deviceId) return;
      const remotePath = targetPath || explorerPathInput.value.trim() || '/sdcard';
      explorerPathInput.value = remotePath;
      vscode.postMessage({ command: 'listDirectory', deviceId, remotePath });
    }

    explorerRefreshBtn.addEventListener('click', () => loadExplorerDirectory());
    explorerPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadExplorerDirectory();
    });

    explorerUpBtn.addEventListener('click', () => {
      let cur = explorerPathInput.value.trim().replace(/\/+$/, '');
      if (!cur || cur === '/' || cur === '') return;
      const idx = cur.lastIndexOf('/');
      const parent = idx <= 0 ? '/' : cur.slice(0, idx);
      loadExplorerDirectory(parent);
    });

    document.querySelectorAll('.explorer-bookmark').forEach(b => {
      b.addEventListener('click', () => {
        const p = b.getAttribute('data-path');
        if (p) loadExplorerDirectory(p);
      });
    });

    explorerNewFolderBtn.addEventListener('click', () => {
      const cur = explorerPathInput.value.trim() || '/sdcard';
      const folderName = prompt('Enter new folder name:');
      if (folderName && folderName.trim()) {
        const cleanParent = cur.endsWith('/') ? cur : (cur + '/');
        const targetDir = cleanParent + folderName.trim();
        const deviceId = deviceSelect.value;
        vscode.postMessage({ command: 'createDirectory', deviceId, targetDir });
      }
    });

    explorerUploadBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      const currentDir = explorerPathInput.value.trim() || '/sdcard';
      if (!deviceId) {
        setStatus('error', '✕ Select a device first');
        return;
      }
      vscode.postMessage({ command: 'uploadDeviceFile', deviceId, currentDir });
    });

    const pushLocalInput = document.getElementById('pushLocalInput');
    const pushRemoteInput = document.getElementById('pushRemoteInput');
    const pushFileBtn = document.getElementById('pushFileBtn');
    const pullRemoteInput = document.getElementById('pullRemoteInput');
    const pullLocalInput = document.getElementById('pullLocalInput');
    const pullFileBtn = document.getElementById('pullFileBtn');

    pushFileBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      const localPath = pushLocalInput.value.trim();
      const remotePath = pushRemoteInput.value.trim();
      if (!deviceId) {
        setStatus('error', '✕ Select a device first');
        return;
      }
      if (!localPath || !remotePath) {
        setStatus('error', '✕ Provide both local and remote paths');
        return;
      }
      vscode.postMessage({ command: 'pushFile', deviceId, localPath, remotePath });
    });

    pullFileBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      const remotePath = pullRemoteInput.value.trim();
      const localPath = pullLocalInput.value.trim();
      if (!deviceId) {
        setStatus('error', '✕ Select a device first');
        return;
      }
      if (!remotePath || !localPath) {
        setStatus('error', '✕ Provide both remote and local paths');
        return;
      }
      vscode.postMessage({ command: 'pullFile', deviceId, remotePath, localPath });
    });

    const shellCmdInput = document.getElementById('shellCmdInput');
    const runShellBtn = document.getElementById('runShellBtn');
    const shellResultContainer = document.getElementById('shellResultContainer');
    const shellOutput = document.getElementById('shellOutput');
    const copyShellBtn = document.getElementById('copyShellBtn');

    function runShellCommand() {
      const deviceId = deviceSelect.value;
      const shellCmd = shellCmdInput.value.trim();
      if (!deviceId) {
        setStatus('error', '✕ Select a device first');
        return;
      }
      if (!shellCmd) {
        setStatus('error', '✕ Enter a command to run');
        return;
      }
      vscode.postMessage({ command: 'executeShellCommand', deviceId, shellCmd });
    }

    runShellBtn.addEventListener('click', runShellCommand);
    shellCmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        runShellCommand();
      }
    });

    document.querySelectorAll('.chip-btn[data-cmd]').forEach(chip => {
      chip.addEventListener('click', () => {
        shellCmdInput.value = chip.getAttribute('data-cmd') || '';
        runShellCommand();
      });
    });

    copyShellBtn.addEventListener('click', () => {
      const text = shellOutput.innerText;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        setStatus('success', '✓ Shell output copied to clipboard');
      });
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'setDevices': {
          deviceSelect.innerHTML = '';
          if (!msg.devices || msg.devices.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = msg.error ? ('⚠️ ' + msg.error) : '✕ No devices attached';
            deviceSelect.appendChild(opt);
          } else {
            msg.devices.forEach(d => {
              const opt = document.createElement('option');
              opt.value = d.id;
              opt.textContent = d.displayName;
              deviceSelect.appendChild(opt);
            });
            const currentSelected = deviceSelect.value;
            if (currentSelected) {
              vscode.postMessage({ command: 'deviceChanged', deviceId: currentSelected });
            }
          }
          break;
        }
        case 'setPackage': {
          if (msg.packageName) {
            pkgInput.value = msg.packageName;
          }
          break;
        }
        case 'setNightMode': {
          if (darkModeBtn) {
            darkModeBtn.textContent = msg.isNight ? '☀️ Light Mode' : '🌙 Dark Mode';
          }
          break;
        }
        case 'setInstalledPackages': {
          if (packagesList && Array.isArray(msg.packages)) {
            packagesList.innerHTML = '';
            msg.packages.forEach(pkg => {
              const opt = document.createElement('option');
              opt.value = pkg;
              packagesList.appendChild(opt);
            });
          }
          break;
        }
        case 'setSharedPrefsFiles': {
          prefFileSelect.innerHTML = '';
          if (!msg.files || msg.files.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No XML files found';
            prefFileSelect.appendChild(opt);
            prefEditorContainer.style.display = 'none';
          } else {
            msg.files.forEach(f => {
              const opt = document.createElement('option');
              opt.value = f;
              opt.textContent = f;
              prefFileSelect.appendChild(opt);
            });
            // Auto load first file
            const firstFile = msg.files[0];
            const deviceId = deviceSelect.value;
            const packageName = pkgInput.value.trim();
            vscode.postMessage({ command: 'readSharedPrefsXml', deviceId, packageName, fileName: firstFile });
          }
          break;
        }
        case 'setSharedPrefsXml': {
          prefTableBody.innerHTML = '';
          const entries = parseXmlEntries(msg.xml);
          entries.forEach(e => addTableRow(e.key, e.type, e.value));
          prefEditorContainer.style.display = 'block';
          break;
        }
        case 'setDatabaseFiles': {
          dbSelect.innerHTML = '';
          if (!msg.files || msg.files.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No SQLite databases found';
            dbSelect.appendChild(opt);
            tableSelect.innerHTML = '<option value="">(No tables)</option>';
            dbTableContainer.style.display = 'none';
          } else {
            msg.files.forEach(f => {
              const opt = document.createElement('option');
              opt.value = f;
              opt.textContent = f;
              dbSelect.appendChild(opt);
            });
            // Load tables for first db
            const firstDb = msg.files[0];
            const deviceId = deviceSelect.value;
            const packageName = pkgInput.value.trim();
            vscode.postMessage({ command: 'getDatabaseTables', deviceId, packageName, dbName: firstDb });
          }
          break;
        }
        case 'setDatabaseTables': {
          tableSelect.innerHTML = '';
          if (!msg.tables || msg.tables.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No tables found';
            tableSelect.appendChild(opt);
            dbTableContainer.style.display = 'none';
          } else {
            msg.tables.forEach(t => {
              const opt = document.createElement('option');
              opt.value = t;
              opt.textContent = t;
              tableSelect.appendChild(opt);
            });
            // Load data for first table
            const firstTable = msg.tables[0];
            const dbName = msg.dbName || dbSelect.value;
            const deviceId = deviceSelect.value;
            const packageName = pkgInput.value.trim();
            vscode.postMessage({ command: 'getTableData', deviceId, packageName, dbName, tableName: firstTable });
          }
          break;
        }
        case 'setTableData': {
          const { queryResult, dbName, tableName } = msg;
          dbTableHead.innerHTML = '';
          dbTableBody.innerHTML = '';
          if (!queryResult || !queryResult.columns || queryResult.columns.length === 0) {
            dbTableContainer.style.display = 'none';
            return;
          }
          currentDbColumns = queryResult.columns;
          // Build Header
          const headTr = document.createElement('tr');
          queryResult.columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            headTr.appendChild(th);
          });
          const actionTh = document.createElement('th');
          actionTh.style.width = '30px';
          headTr.appendChild(actionTh);
          dbTableHead.appendChild(headTr);

          // Build Rows
          const pkCol = queryResult.columns[0];
          queryResult.rows.forEach(row => {
            const tr = document.createElement('tr');
            const pkVal = row[0] || '';
            row.forEach((cellVal, colIdx) => {
              const td = document.createElement('td');
              const input = document.createElement('input');
              input.type = 'text';
              input.value = cellVal;
              input.className = 'pref-val';
              input.style.width = '100%';
              input.addEventListener('change', () => {
                const targetCol = queryResult.columns[colIdx];
                const newVal = input.value;
                const deviceId = deviceSelect.value;
                const packageName = pkgInput.value.trim();
                vscode.postMessage({
                  command: 'updateTableCell',
                  deviceId,
                  packageName,
                  dbName,
                  tableName,
                  pkCol,
                  pkVal,
                  targetCol,
                  newVal
                });
              });
              td.appendChild(input);
              tr.appendChild(td);
            });
            // Delete button cell
            const delTd = document.createElement('td');
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-del';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete Row';
            delBtn.addEventListener('click', () => {
              const deviceId = deviceSelect.value;
              const packageName = pkgInput.value.trim();
              vscode.postMessage({
                command: 'deleteTableRow',
                deviceId,
                packageName,
                dbName,
                tableName,
                pkCol,
                pkVal
              });
              tr.remove();
            });
            delTd.appendChild(delBtn);
            tr.appendChild(delTd);

            dbTableBody.appendChild(tr);
          });
          dbTableContainer.style.display = 'block';
          break;
        }
        case 'setSqlResult': {
          const { queryResult } = msg;
          sqlResultHead.innerHTML = '';
          sqlResultBody.innerHTML = '';
          if (!queryResult || !queryResult.columns || queryResult.columns.length === 0) {
            sqlResultContainer.style.display = 'none';
            return;
          }
          const headTr = document.createElement('tr');
          queryResult.columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            headTr.appendChild(th);
          });
          sqlResultHead.appendChild(headTr);

          queryResult.rows.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach(cellVal => {
              const td = document.createElement('td');
              td.textContent = cellVal;
              td.style.fontSize = '11.5px';
              td.style.padding = '4px 6px';
              tr.appendChild(td);
            });
            sqlResultBody.appendChild(tr);
          });
          sqlResultContainer.style.display = 'block';
          break;
        }
        case 'setLogcatResult': {
          const lines = msg.lines || [];
          logcatCountLabel.textContent = lines.length + ' lines';
          logcatOutput.innerHTML = '';
          if (lines.length === 0) {
            logcatOutput.textContent = '(No matching logs found)';
          } else {
            lines.forEach(l => {
              const div = document.createElement('div');
              let cls = 'log-line-v';
              if (l.includes(' E ') || l.startsWith('E/')) cls = 'log-line-e';
              else if (l.includes(' W ') || l.startsWith('W/')) cls = 'log-line-w';
              else if (l.includes(' I ') || l.startsWith('I/')) cls = 'log-line-i';
              else if (l.includes(' D ') || l.startsWith('D/')) cls = 'log-line-d';
              else if (l.includes(' F ') || l.startsWith('F/')) cls = 'log-line-f';
              div.className = cls;
              div.textContent = l;
              logcatOutput.appendChild(div);
            });
          }
          logcatOutput.style.display = 'block';
          logcatOutput.scrollTop = logcatOutput.scrollHeight;
          break;
        }
        case 'setAppMemoryResult': {
          const mem = msg.memoryInfo;
          if (!mem) return;
          memPssVal.textContent = (mem.totalPssMb || 0).toFixed(1) + ' MB';
          memRssVal.textContent = (mem.totalRssMb || 0).toFixed(1) + ' MB';
          memJavaVal.textContent = ((mem.javaHeapKb || 0) / 1024).toFixed(1) + ' MB';
          memNativeVal.textContent = ((mem.nativeHeapKb || 0) / 1024).toFixed(1) + ' MB';
          memGraphicsVal.textContent = ((mem.graphicsKb || 0) / 1024).toFixed(1) + ' MB';
          memCodeVal.textContent = (((mem.codeKb || 0) + (mem.stackKb || 0)) / 1024).toFixed(1) + ' MB';
          memoryRawOutput.textContent = mem.rawSummary || 'No raw summary available';
          memoryResultsContainer.style.display = 'block';
          break;
        }
        case 'setShellResult': {
          shellOutput.textContent = msg.output || '(No output)';
          shellResultContainer.style.display = 'block';
          shellOutput.scrollTop = shellOutput.scrollHeight;
          break;
        }
        case 'setDirectoryContents': {
          if (msg.path) {
            explorerPathInput.value = msg.path;
          }
          explorerTableBody.innerHTML = '';
          const entries = msg.entries || [];
          if (entries.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="3" style="text-align: center; color: #888; padding: 12px;">(Empty directory)</td>';
            explorerTableBody.appendChild(tr);
            break;
          }

          entries.forEach(item => {
            const tr = document.createElement('tr');
            let icon = '📄';
            if (item.isDirectory) icon = '📁';
            else if (item.isLink) icon = '🔗';
            else if (/\\.(png|jpg|jpeg|webp|gif|svg)$/i.test(item.name)) icon = '🖼️';
            else if (/\\.(apk|aab)$/i.test(item.name)) icon = '📦';
            else if (/\\.(mp3|wav|ogg|m4a|aac)$/i.test(item.name)) icon = '🎵';
            else if (/\\.(mp4|mkv|mov|webm)$/i.test(item.name)) icon = '🎬';
            else if (/\\.(db|sqlite|realm)$/i.test(item.name)) icon = '🗄️';
            else if (/\\.(txt|json|xml|log|md|prop|sh|cfg)$/i.test(item.name)) icon = '📝';

            const nameTd = document.createElement('td');
            nameTd.style.padding = '4px 6px';
            nameTd.style.whiteSpace = 'nowrap';
            nameTd.style.overflow = 'hidden';
            nameTd.style.textOverflow = 'ellipsis';
            nameTd.style.maxWidth = '130px';

            if (item.isDirectory) {
              const link = document.createElement('a');
              link.className = 'explorer-folder-link';
              link.textContent = icon + ' ' + item.name;
              link.title = 'Open ' + item.path;
              link.addEventListener('click', () => loadExplorerDirectory(item.path));
              nameTd.appendChild(link);
            } else {
              nameTd.textContent = icon + ' ' + item.name;
              nameTd.title = item.path;
            }

            const sizeTd = document.createElement('td');
            sizeTd.style.textAlign = 'right';
            sizeTd.style.fontSize = '10.5px';
            sizeTd.style.color = 'var(--vscode-foreground, #888)';
            sizeTd.style.padding = '4px 6px';
            sizeTd.textContent = item.sizeFormatted || '--';

            const actTd = document.createElement('td');
            actTd.style.textAlign = 'center';
            actTd.style.padding = '4px 2px';
            const actDiv = document.createElement('div');
            actDiv.style.display = 'flex';
            actDiv.style.gap = '3px';
            actDiv.style.justifyContent = 'center';

            if (!item.isDirectory) {
              const viewBtn = document.createElement('button');
              viewBtn.className = 'btn-xs';
              viewBtn.textContent = '👁️';
              viewBtn.title = 'Preview in VS Code Editor';
              viewBtn.style.cursor = 'pointer';
              viewBtn.style.background = 'transparent';
              viewBtn.style.border = '1px solid var(--vscode-input-border, #444)';
              viewBtn.style.color = '#fff';
              viewBtn.addEventListener('click', () => {
                const deviceId = deviceSelect.value;
                vscode.postMessage({ command: 'previewDeviceFile', deviceId, remotePath: item.path });
              });
              actDiv.appendChild(viewBtn);

              const dlBtn = document.createElement('button');
              dlBtn.className = 'btn-xs';
              dlBtn.textContent = '⬇️';
              dlBtn.title = 'Download to Computer';
              dlBtn.style.cursor = 'pointer';
              dlBtn.style.background = 'transparent';
              dlBtn.style.border = '1px solid var(--vscode-input-border, #444)';
              dlBtn.style.color = '#fff';
              dlBtn.addEventListener('click', () => {
                const deviceId = deviceSelect.value;
                vscode.postMessage({ command: 'downloadDeviceFile', deviceId, remotePath: item.path });
              });
              actDiv.appendChild(dlBtn);
            }

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-xs';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete from Device';
            delBtn.style.cursor = 'pointer';
            delBtn.style.background = 'transparent';
            delBtn.style.border = '1px solid #5c2b2e';
            delBtn.style.color = '#f28b82';
            delBtn.addEventListener('click', () => {
              if (confirm('Delete ' + item.name + ' from device?')) {
                const deviceId = deviceSelect.value;
                const currentDir = explorerPathInput.value.trim() || '/sdcard';
                vscode.postMessage({ command: 'deleteDeviceFile', deviceId, targetPath: item.path, currentDir });
              }
            });
            actDiv.appendChild(delBtn);

            actTd.appendChild(actDiv);
            tr.appendChild(nameTd);
            tr.appendChild(sizeTd);
            tr.appendChild(actTd);
            explorerTableBody.appendChild(tr);
          });
          break;
        }
        case 'setStatus': {
          setStatus(msg.statusType, msg.message);
          break;
        }
        case 'triggerRefresh': {
          vscode.postMessage({ command: 'refreshDevices' });
          break;
        }
        case 'triggerAutoDetect': {
          vscode.postMessage({ command: 'autoDetectPackage' });
          break;
        }
      }
    });

    // Auto-detect connected devices and package on startup
    vscode.postMessage({ command: 'refreshDevices' });
    vscode.postMessage({ command: 'autoDetectPackage' });
  </script>
</body>
</html>`;
  }
}
