import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ProjectScriptOption {
  label: string;
  description: string;
  detail: string;
  command: string;
  type: 'dev' | 'prod' | 'build' | 'deploy' | 'test' | 'custom';
}

export class ProjectRunner {
  private static terminal: vscode.Terminal | undefined;

  /**
   * Scans current workspace root for package.json or web frameworks
   */
  public static async getAvailableScripts(): Promise<{ projectType: string; scripts: ProjectScriptOption[] }> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return { projectType: 'No workspace folder open', scripts: [] };
    }

    const rootPath = folders[0].uri.fsPath;
    const pkgPath = path.join(rootPath, 'package.json');

    if (!fs.existsSync(pkgPath)) {
      return { projectType: 'Non-Node workspace', scripts: [] };
    }

    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw);
      const scriptsObj = pkg.scripts || {};
      const scriptKeys = Object.keys(scriptsObj);

      // Detect project type
      let projectType = 'Web Project';
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['next']) projectType = 'Next.js App';
      else if (deps['vite']) projectType = 'Vite Web App';
      else if (deps['@angular/core']) projectType = 'Angular App';
      else if (deps['react-scripts']) projectType = 'Create React App';
      else if (deps['vue'] || deps['nuxt']) projectType = 'Vue/Nuxt App';
      else if (deps['astro']) projectType = 'Astro Site';
      else if (deps['svelte']) projectType = 'Svelte App';

      const scriptOptions: ProjectScriptOption[] = [];

      // Categorize common runner intents
      // 1. Dev mode
      const devKey = scriptKeys.find(k => ['dev', 'start:dev', 'serve', 'develop'].includes(k));
      if (devKey) {
        scriptOptions.push({
          label: `$(play) Run Dev Mode (${devKey})`,
          description: `npm run ${devKey}`,
          detail: `Command: ${scriptsObj[devKey]}`,
          command: `npm run ${devKey}`,
          type: 'dev'
        });
      }

      // 2. Production / Start
      const startKey = scriptKeys.find(k => ['start', 'start:prod', 'serve:prod', 'preview'].includes(k));
      if (startKey && startKey !== devKey) {
        scriptOptions.push({
          label: `$(rocket) Run Prod / Start (${startKey})`,
          description: `npm run ${startKey}`,
          detail: `Command: ${scriptsObj[startKey]}`,
          command: `npm run ${startKey}`,
          type: 'prod'
        });
      }

      // 3. Build
      const buildKey = scriptKeys.find(k => ['build', 'build:prod', 'compile'].includes(k));
      if (buildKey) {
        scriptOptions.push({
          label: `$(package) Build Project (${buildKey})`,
          description: `npm run ${buildKey}`,
          detail: `Command: ${scriptsObj[buildKey]}`,
          command: `npm run ${buildKey}`,
          type: 'build'
        });
      }

      // 4. Deploy
      const deployKey = scriptKeys.find(k => ['deploy', 'publish', 'release'].includes(k));
      if (deployKey) {
        scriptOptions.push({
          label: `$(cloud-upload) Deploy Project (${deployKey})`,
          description: `npm run ${deployKey}`,
          detail: `Command: ${scriptsObj[deployKey]}`,
          command: `npm run ${deployKey}`,
          type: 'deploy'
        });
      }

      // 5. Test
      const testKey = scriptKeys.find(k => ['test', 'test:unit', 'test:watch'].includes(k));
      if (testKey) {
        scriptOptions.push({
          label: `$(beaker) Run Tests (${testKey})`,
          description: `npm run ${testKey}`,
          detail: `Command: ${scriptsObj[testKey]}`,
          command: `npm run ${testKey}`,
          type: 'test'
        });
      }

      // Add remaining custom scripts
      for (const k of scriptKeys) {
        if (![devKey, startKey, buildKey, deployKey, testKey].includes(k)) {
          scriptOptions.push({
            label: `$(terminal) Script: ${k}`,
            description: `npm run ${k}`,
            detail: `Command: ${scriptsObj[k]}`,
            command: `npm run ${k}`,
            type: 'custom'
          });
        }
      }

      return { projectType, scripts: scriptOptions };
    } catch {
      return { projectType: 'Error parsing package.json', scripts: [] };
    }
  }

  /**
   * Shows a VS Code QuickPick to select and run a script
   */
  public static async promptAndRunScript(): Promise<void> {
    const { projectType, scripts } = await this.getAvailableScripts();

    if (scripts.length === 0) {
      vscode.window.showInformationMessage(`No npm scripts found in the current workspace (${projectType}).`);
      return;
    }

    const selected = await vscode.window.showQuickPick(
      scripts.map(s => ({
        label: s.label,
        description: s.description,
        detail: s.detail,
        command: s.command
      })),
      {
        placeHolder: `Select configuration to run for ${projectType}`,
        title: `▶ Run Project: ${projectType}`
      }
    );

    if (selected) {
      this.executeCommandInTerminal(selected.command);
    }
  }

  /**
   * Runs the given CLI command in a dedicated VS Code terminal
   */
  public static executeCommandInTerminal(command: string): void {
    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      this.terminal = vscode.window.createTerminal('Web Project Runner');
    }
    this.terminal.show();
    this.terminal.sendText(command);
  }
}
