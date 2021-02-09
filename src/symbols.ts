import * as vscode from 'vscode';
import { P4Document } from './parser';

/**
 * Declaration provider class
 */
export class P4SymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
    return new Promise((resolve) => {
      const p4Document = new P4Document(document, token);
      if (token.isCancellationRequested) resolve(null);
      const symbols = new Array<vscode.DocumentSymbol>();
      for (const [name, ass] of p4Document.p4Assignments.entries()) {
        let kind;
        switch (ass.operator) {
          case 'EQU':
            kind = vscode.SymbolKind.Constant;
            break;
          case 'WORD':
            kind = vscode.SymbolKind.Variable;
            break;
          default:
            kind = vscode.SymbolKind.Array;
            break;
        }
        symbols.push(
          new vscode.DocumentSymbol(name, '', kind, ass.vscodeTextLine.range, ass.valueRange)
        );
      }
      for (const [name, label] of p4Document.p4Labels.entries())
        symbols.push(
          new vscode.DocumentSymbol(
            name,
            '',
            vscode.SymbolKind.Function,
            label.vscodeTextLine.range,
            label.labelRange
          )
        );
      resolve(symbols);
    });
  }
}
