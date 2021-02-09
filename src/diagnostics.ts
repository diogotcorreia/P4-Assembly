import * as vscode from 'vscode';
import assembler from './p4/assembler';

const severity = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
};

type Error = {
  line: number;
  from: number;
  to: number;
  message: string;
  severity: 'error' | 'warning' | undefined;
};

export class P4DiagnosticsProvider {
  diagnosticCollection: vscode.DiagnosticCollection;

  constructor(diagnosticCollection: vscode.DiagnosticCollection) {
    this.diagnosticCollection = diagnosticCollection;
  }

  public refreshDiagnostics(doc: vscode.TextDocument): void {
    if (doc.languageId !== 'p4') return;

    const diagnostics: vscode.Diagnostic[] = [];

    const assemblerResult = assembler.assemble(doc.getText());

    const errors = assemblerResult.errors;

    diagnostics.push(...errors.map((error) => this.createDiagnostic(doc, error)));

    this.diagnosticCollection.set(doc.uri, diagnostics);
  }

  public createDiagnostic(doc: vscode.TextDocument, error: Error): vscode.Diagnostic {
    // improve poor range from linter
    if (error.from === 0 && error.to === 0) {
      const line = doc.lineAt(error.line);
      error.to = line.text.length;
    }

    // create range that represents, where in the document the word is
    const range = new vscode.Range(error.line, error.from, error.line, error.to);

    const diagnostic = new vscode.Diagnostic(
      range,
      error.message,
      severity[error.severity || 'error']
    );
    return diagnostic;
  }

  public subscribeToDocumentChanges(context: vscode.ExtensionContext): void {
    if (vscode.window.activeTextEditor)
      this.refreshDiagnostics(vscode.window.activeTextEditor.document);

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.refreshDiagnostics(editor.document);
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.refreshDiagnostics(e.document))
    );

    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument((doc) => this.diagnosticCollection.delete(doc.uri))
    );
  }
}
