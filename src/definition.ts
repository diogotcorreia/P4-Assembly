import * as vscode from 'vscode';
import { P3DocumentationManager } from './documentation';

/**
 * Declaration provider class
 */
export class P3DefinitionProvider implements vscode.DefinitionProvider {
  documentationManager: P3DocumentationManager;

  constructor(documentationManager: P3DocumentationManager) {
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
