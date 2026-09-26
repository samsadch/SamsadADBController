import * as vscode from 'vscode';
import { AdbViewProvider } from './adbViewProvider';
import { AdbExecutor } from './adbExecutor';

export function activate(context: vscode.ExtensionContext) {
  const provider = new AdbViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AdbViewProvider.viewType, provider)
  );

  // Path settings feed the shared core at construction, so drop the cached instance when
  // they change rather than requiring a window reload.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('samsadAdb')) {
        AdbExecutor.reset();
      }
    })
  );

  // Acquired per command so a settings change takes effect immediately.
  const executor = () => AdbExecutor.getInstance();

  // Register commands for Command Palette integration
  context.subscriptions.push(
    vscode.commands.registerCommand('samsad-adb.refreshDevices', () => {
      provider.refresh();
    }),
    vscode.commands.registerCommand('samsad-adb.restartApp', async () => {
      const devices = await executor().getConnectedDevices();
      if (devices.length === 0) {
        vscode.window.showErrorMessage('Samsad ADB: No connected devices found.');
        return;
      }
      const device = devices[0];
      const pkg = await vscode.window.showInputBox({ prompt: 'Enter package name to restart' });
      if (pkg) {
        try {
          await executor().restartApp(device.id, pkg);
          vscode.window.showInformationMessage(`Samsad ADB: Restarted ${pkg} on ${device.model}`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Samsad ADB Error: ${e.message}`);
        }
      }
    }),
    vscode.commands.registerCommand('samsad-adb.clearAppData', async () => {
      const devices = await executor().getConnectedDevices();
      if (devices.length === 0) {
        vscode.window.showErrorMessage('Samsad ADB: No connected devices found.');
        return;
      }
      const device = devices[0];
      const pkg = await vscode.window.showInputBox({ prompt: 'Enter package name to clear data' });
      if (pkg) {
        try {
          await executor().clearAppData(device.id, pkg);
          vscode.window.showInformationMessage(`Samsad ADB: Cleared app data for ${pkg}`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Samsad ADB Error: ${e.message}`);
        }
      }
    }),
    vscode.commands.registerCommand('samsad-adb.clearAndRestartApp', async () => {
      const devices = await executor().getConnectedDevices();
      if (devices.length === 0) {
        vscode.window.showErrorMessage('Samsad ADB: No connected devices found.');
        return;
      }
      const device = devices[0];
      const pkg = await vscode.window.showInputBox({ prompt: 'Enter package name to clear and restart' });
      if (pkg) {
        try {
          await executor().clearAndRestartApp(device.id, pkg);
          vscode.window.showInformationMessage(`Samsad ADB: Cleared data & restarted ${pkg}`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Samsad ADB Error: ${e.message}`);
        }
      }
    }),
    vscode.commands.registerCommand('samsad-adb.screenshot', async () => {
      const devices = await executor().getConnectedDevices();
      if (devices.length === 0) {
        vscode.window.showErrorMessage('Samsad ADB: No connected devices found.');
        return;
      }
      try {
        const msg = await executor().captureScreenshot(devices[0].id);
        vscode.window.showInformationMessage(`Samsad ADB: ${msg}`);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Samsad ADB Screenshot Error: ${e.message}`);
      }
    }),
    vscode.commands.registerCommand('samsad-adb.toggleDarkMode', async () => {
      const devices = await executor().getConnectedDevices();
      if (devices.length === 0) {
        vscode.window.showErrorMessage('Samsad ADB: No connected devices found.');
        return;
      }
      try {
        const msg = await executor().toggleDarkMode(devices[0].id);
        vscode.window.showInformationMessage(`Samsad ADB: ${msg}`);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Samsad ADB Error: ${e.message}`);
      }
    })
  );
}

export function deactivate() {}
