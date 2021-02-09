import { P4Formatter } from './formatter';
import { P4DiagnosticsProvider } from './diagnostics';
import { P4Simulator } from './webview';
import * as vscode from 'vscode';
import { P4HoverProvider } from './hover';
import { P4DocumentationManager } from './documentation';
import * as path from 'path';
import { P4DefinitionProvider } from './definition';
import { P4SymbolProvider } from './symbols';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
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

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider('p4', new P4Formatter())
  );

  // Setup linter (diagnostics implementation)
  const diagnosticsProvider = new P4DiagnosticsProvider(
    vscode.languages.createDiagnosticCollection('p4')
  );
  context.subscriptions.push(diagnosticsProvider.diagnosticCollection);

  diagnosticsProvider.subscribeToDocumentChanges(context);

  //assemble and simulate commands
  const outputChannel = vscode.window.createOutputChannel('P4');

  const simulator = new P4Simulator(context, outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.setSimulator', () => simulator.select())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.runAssembler&Simulator', () => simulator.run())
  );
}

export class ExtensionState {
  private documentationManager: P4DocumentationManager | undefined;
  private diagnosticsProvider: P4DiagnosticsProvider | undefined;
  private extensionPath: string = path.join(__dirname, '..');

  public async getDocumentationManager(): Promise<P4DocumentationManager> {
    if (this.documentationManager === undefined) {
      this.documentationManager = new P4DocumentationManager(this.extensionPath);
      await this.documentationManager.load();
    }
    return this.documentationManager;
  }

  public setExtensionPath(extensionPath: string): void {
    this.extensionPath = extensionPath;
  }

  public setDiagnosticsProvider(diagnosticsProvider: P4DiagnosticsProvider): void {
    this.diagnosticsProvider = diagnosticsProvider;
  }

  public getDiagnosticsProvider(): P4DiagnosticsProvider | undefined {
    return this.diagnosticsProvider;
  }
}

const state = new ExtensionState();
