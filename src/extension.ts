import { P4DiagnosticsProvider } from './diagnostics';
import { P4Simulator } from './webview';
import * as vscode from 'vscode';
import { P4HoverProvider } from './hover';
import { P4DocumentationManager } from './documentation';
import * as path from 'path';
import { P4DefinitionProvider } from './definition';
import { P4SymbolProvider } from './symbols';

export async function activate(context: vscode.ExtensionContext) {
  state.setExtensionPath(context.extensionPath);

  await state.getDocumentationManager().then((docManager) => {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider('p4', new P4HoverProvider(docManager))
    );
    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider('p4', new P4DefinitionProvider(docManager))
    );
  });

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider('p4', new P4SymbolProvider())
  );

  // Setup linter (diagnostics implementation)
  let diagnosticsProvider = new P4DiagnosticsProvider(
    vscode.languages.createDiagnosticCollection('p4')
  );
  context.subscriptions.push(diagnosticsProvider.diagnosticCollection);

  diagnosticsProvider.subscribeToDocumentChanges(context);

  //assemble and simulate commands
  let outputChannel = vscode.window.createOutputChannel('P4');

  let simulator = new P4Simulator(context, outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.setSimulator', () => simulator.select())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.runAssembler&Simulator', () => simulator.run())
  );
}

export function deactivate() {}

export class ExtensionState {
  private documentationManager: P4DocumentationManager | undefined;
  private diagnosticsProvider: P4DiagnosticsProvider | undefined;
  private extensionPath: string = path.join(__dirname, '..');

  public getDocumentationManager(): Promise<P4DocumentationManager> {
    return new Promise(async (resolve, _reject) => {
      if (this.documentationManager === undefined) {
        this.documentationManager = new P4DocumentationManager(this.extensionPath);
        await this.documentationManager.load();
      }
      resolve(this.documentationManager);
    });
  }

  public setExtensionPath(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  public setDiagnosticsProvider(diagnosticsProvider: P4DiagnosticsProvider) {
    this.diagnosticsProvider = diagnosticsProvider;
  }

  public getDiagnosticsProvider(): P4DiagnosticsProvider | undefined {
    return this.diagnosticsProvider;
  }
}

const state = new ExtensionState();
