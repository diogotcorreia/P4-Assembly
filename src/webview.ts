import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const GLOBAL_STATE_NAME = 'p4-simulator';

export class P4Simulator {
  context: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
  execPath: string | undefined;

  static asFilePath: string | undefined;

  constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.setExecPath(this.context.globalState.get(GLOBAL_STATE_NAME));
  }

  private noPathDefinedMsg(): string {
    return 'Nenhum simulador definido';
  }

  private requestPathSelectionMsg(): string {
    return 'Selecionar simulador P4';
  }

  private selectedPathMsg(): string {
    return 'Simulador selecionado: ' + this.execPath;
  }

  private setExecPath(pathToWrite: string | undefined): void {
    this.execPath = pathToWrite;
    if (pathToWrite) {
      this.context.globalState.update(GLOBAL_STATE_NAME, pathToWrite);
      fs.chmod(pathToWrite, 0o775, (err) => {
        if (err) throw err;
      });
    }
  }

  public select(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: this.requestPathSelectionMsg(),
      };

      vscode.window.showOpenDialog(options).then((fileUri) => {
        if (fileUri && fileUri[0]) {
          this.setExecPath(fileUri[0].fsPath.toString());
          vscode.window.showInformationMessage(this.selectedPathMsg());
          resolve();
        } else {
          vscode.window.showWarningMessage(this.noPathDefinedMsg());
          reject();
        }
      });
    });
  }

  private static getActiveFile(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (vscode.window.activeTextEditor) {
        let currentFile = vscode.window.activeTextEditor.document.fileName;
        if (currentFile.endsWith('.as')) {
          P4Simulator.asFilePath = currentFile;
          resolve(currentFile);
        } else resolve(P4Simulator.asFilePath);
      } else {
        vscode.window.showWarningMessage('Nenhum ficheiro .as ativo');
        reject();
      }
    });
  }

  private checkSelectionState(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.execPath)
        vscode.window
          .showWarningMessage(this.noPathDefinedMsg(), ...[this.requestPathSelectionMsg()])
          .then((selection) => {
            if (selection) this.select().then(resolve).catch(reject);
            else reject();
          });
      else resolve();
    });
  }

  public run(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      P4Simulator.getActiveFile().then((activeFile) =>
        this.checkSelectionState().then(() => {
          if (this.execPath && activeFile) {
            const panel = vscode.window.createWebviewPanel(
              'p4-simulator',
              'Simulador P4',
              vscode.ViewColumn.One,
              {
                // Enable scripts in the webview
                enableScripts: true,
                localResourceRoots: [
                  vscode.Uri.file(path.join(this.context.extensionPath)),
                  vscode.Uri.file(path.join(this.execPath)),
                ],
              }
            );

            this.getHtml().then((html) => {
              ASSETS.forEach((asset) => {
                const uri = vscode.Uri.file(path.join(this.execPath || '', asset));
                const assetSrc = panel.webview.asWebviewUri(uri);
                html = html.replace(asset, assetSrc.toString());
              });

              const bridgePath = vscode.Uri.file(
                path.join(this.context.extensionPath, 'src', 'sim-bridge.js')
              );
              const bridgeSrc = panel.webview.asWebviewUri(bridgePath);

              const stylePath = vscode.Uri.file(
                path.join(this.context.extensionPath, 'src', 'sim.css')
              );
              const styleSrc = panel.webview.asWebviewUri(stylePath);

              html = html.replace(
                '</head>',
                `<link rel="stylesheet" href="${styleSrc}"><script src="${bridgeSrc}" defer></script></head>`
              );

              panel.webview.html = html;
            });

            const unregisterEvent = vscode.workspace.onDidSaveTextDocument(
              (document: vscode.TextDocument) => {
                if (document.languageId === 'p4' && document.uri.scheme === 'file')
                  panel.webview.postMessage({
                    command: 'update-code',
                    content: document.getText(),
                  });
              }
            );

            panel.onDidDispose(
              () => {
                // When the panel is closed, cancel any future updates to the webview content
                unregisterEvent.dispose();
              },
              null,
              this.context.subscriptions
            );

            panel.onDidChangeViewState(
              (event: vscode.WebviewPanelOnDidChangeViewStateEvent) => {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor)
                  event.webviewPanel.webview.postMessage({
                    command: 'update-code',
                    content: activeEditor.document.getText(),
                  });
              },
              null,
              this.context.subscriptions
            );
          } else reject();
        })
      );
    });
  }

  private getHtml(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (this.execPath)
        fs.readFile(path.join(this.execPath, 'index.htm'), { encoding: 'utf-8' }, (err, data) => {
          if (err) reject(err);

          resolve(data);
        });
      else reject();
    });
  }
}

const ASSETS = [
  'fonts/lcd-dot-matrix-hd44780u.ttf',
  'fonts/cp437.ttf',
  'fonts/Segment7Standard.otf',
  'scripts/codemirror-5.38.0/lib/codemirror.css',
  'style.css',
  'scripts/codemirror-5.38.0/lib/codemirror.min.js',
  'scripts/codemirror-5.38.0/addon/lint/lint.js',
  'scripts/codemirror-5.38.0/addon/display/rulers.js',
  'scripts/codemirror-5.38.0/addon/search/search.js',
  'scripts/codemirror-5.38.0/addon/search/searchcursor.js',
  'scripts/codemirror-5.38.0/addon/dialog/dialog.js',
  'scripts/codemirror-5.38.0/mode/p4/p4.js',
  'scripts/cp437.js',
  'scripts/i18n.js',
  'scripts/i18n-pt.js',
  'scripts/assembler.js',
  'scripts/generateMIF.js',
  'scripts/script.js',
  'scripts/simUI.js',
  'scripts/UI.js',
  'scripts/modal.js',
  'scripts/disassembler.js',
  'scripts/sim.js',
  'scripts/parseMIF.js',
  'scripts/jszip.min.js',
  'scripts/writeProgram.js',
  'scripts/readProgram.js',
  'scripts/FileSaver.min.js',
  'scripts/TerminalEditor.js',
  'scripts/FontEditor/inflate.js',
  'scripts/FontEditor/png.js',
  'scripts/FontEditor/FontEditor.js',
  'scripts/codemirror-5.38.0/addon/lint/lint.css',
  'scripts/codemirror-5.38.0/addon/dialog/dialog.css',
  'scripts/codemirror-5.38.0/theme/eclipse.css',
  'demos/Welcome.js',
];
