import * as vscode from 'vscode';
import { P3Document } from './parser';

/**
 * Declaration provider class
 */
export class P3SymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
    return new Promise((resolve) => {
      let p3Document = new P3Document(document, token);
      if (token.isCancellationRequested) resolve();
      let symbols = new Array<vscode.DocumentSymbol>();
      for (let [name, ass] of p3Document.p3Assignments.entries()) {
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
      for (let [name, label] of p3Document.p3Labels.entries())
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
