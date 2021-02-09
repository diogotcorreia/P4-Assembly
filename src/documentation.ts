import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { P4Line, P4Document, P4LineType } from './parser';

export class P4DocumentationManager {
  instructions = new Map<string, P4DocumentationInstruction>();
  registers = new Map<string, P4DocumentationRegister>();
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  public load(): Promise<void> {
    return new Promise((resolve) => {
      const filePathInstructions = path.join(this.extensionPath, 'docs', 'instructions.csv');
      let buffer = fs.readFileSync(filePathInstructions, 'utf8');
      let lines = buffer.toString().split(/\r\n|\r|\n/g);
      let lineIndex = 0;
      for (const line of lines) {
        if (line.length > 0)
          try {
            const inst = new P4DocumentationInstruction(line);
            this.instructions.set(inst.name, inst);
          } catch (err) {
            console.error(
              "Error parsing file 'instructionsset.csv' on line [" + lineIndex + "]: '" + line + "'"
            );
            throw err;
          }
        lineIndex++;
      }

      const filePathRegisters = path.join(this.extensionPath, 'docs', 'registers.csv');
      buffer = fs.readFileSync(filePathRegisters, 'utf8');
      lines = buffer.toString().split(/\r\n|\r|\n/g);
      lineIndex = 0;
      for (const line of lines) {
        if (line.length > 0)
          try {
            const reg = new P4DocumentationRegister(line);
            for (const alias of reg.alias) this.registers.set(alias, reg);
            this.registers.set(reg.name, reg);
          } catch (err) {
            console.error(
              "Error parsing file 'registers.csv' on line [" + lineIndex + "]: '" + line + "'"
            );
            throw err;
          }

        lineIndex++;
      }
      resolve();
    });
  }

  //resolves to the starting position of the relevant data
  public findDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Position | null> {
    return new Promise<vscode.Position | null>((resolve) => {
      const line = document.lineAt(position.line);
      const p4Line = new P4Line(line.text, line);
      const word = document.getText(document.getWordRangeAtPosition(position)).trim();
      //if this is inside quotes, we have to ignore it
      if (p4Line.findOpeningQuote(position) >= 0) resolve(null);
      //we do not want to show label info on the actual label definition
      if (p4Line.lineType !== P4LineType.LABEL || !p4Line.labelRange.contains(position)) {
        const p4Document = new P4Document(document, token);
        const label = p4Document.p4Labels.get(word);
        if (label)
          resolve(label.instructionRange ? label.instructionRange.start : label.labelRange.end);
      }
      //we do not want to show label info on the actual variable definition
      if (p4Line.lineType !== P4LineType.ASSIGNMENT || !p4Line.variableRange.contains(position)) {
        const p4Document = new P4Document(document, token);
        const variable = p4Document.p4Assignments.get(word);
        if (variable) resolve(variable.valueRange.start);
      }
      resolve(null);
    });
  }
}

export class P4DocumentationRegister {
  name = '';
  description = '';
  alias: string[];

  constructor(inst: string) {
    const comps = inst.split(';');
    this.name = comps[0].toUpperCase();
    this.description = comps[1];
    this.alias = comps[2].split(',');
  }
}

export class P4DocumentationInstruction {
  static possibleFlags = ['Z', 'C', 'N', 'O', 'E'];

  name = '';
  format = '';
  description = '';
  flags = '';
  pseudo = false;

  constructor(inst: string) {
    const comps = inst.split(';');
    this.name = comps[0].toUpperCase();
    this.format = comps[1];
    this.description = comps[2];
    const flagmask = comps[3].toUpperCase();
    for (const flag of P4DocumentationInstruction.possibleFlags)
      if (flagmask.indexOf(flag) >= 0) this.flags += flag;
    this.pseudo = comps[4].toLowerCase() === 'true';
  }
}
