import * as vscode from 'vscode';
import { P4DocumentationManager } from './documentation';

/**
 * Declaration provider class
 */
export class P4DefinitionProvider implements vscode.DefinitionProvider {
  documentationManager: P4DocumentationManager;

  constructor(documentationManager: P4DocumentationManager) {
    this.documentationManager = documentationManager;
  }

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Declaration> {
    return new Promise((resolve) => {
      this.documentationManager.findDefinition(document, position, token).then((position) => {
        if (position) resolve(new vscode.Location(document.uri, position));
        resolve();
      });
    });
  }
}
