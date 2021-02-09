import { P4Document } from './parser';
import * as vscode from 'vscode';

const LEFT_MARGIN = ' '.repeat(16);

export class P4Formatter implements vscode.DocumentFormattingEditProvider {
  public provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
    const p4Document = new P4Document(document);

    const edits: vscode.TextEdit[] = [];

    p4Document.p4LinesArray.forEach((line) => {
      const leadingSpaces = line.spacesBeforeLabelRange;
      // This probably should not happen, but don't mess with lines that don't respect this
      if (leadingSpaces.start.character !== 0) return;

      // Whitespace lines should be empty
      if (line.raw === '') return;
      else if (line.raw.trim() === '')
        edits.push(vscode.TextEdit.delete(new vscode.Range(line.start, line.end)));
      else if (line.label) {
        // Lines with a label should not have any leading spaces
        if (line.instruction) {
          // Include semicolon (:) and trailing space in length
          const labelLength = line.labelRange.end.character - line.labelRange.start.character + 2;
          // Missing spaces
          if (labelLength < 16)
            // 16 - 1 (semicolon) - label length
            edits.push(
              vscode.TextEdit.replace(
                line.spacesLabelToInstructionRange,
                ' '.repeat(17 - labelLength)
              )
            );
          else if (labelLength > 16)
            edits.push(
              vscode.TextEdit.replace(line.spacesLabelToInstructionRange, '\n' + LEFT_MARGIN)
            );
        }
        if (leadingSpaces.end.character !== 0)
          edits.push(vscode.TextEdit.replace(leadingSpaces, ''));
      } else if (leadingSpaces.end.character !== 16)
        edits.push(vscode.TextEdit.replace(leadingSpaces, LEFT_MARGIN));
    });

    return edits;
  }
}
