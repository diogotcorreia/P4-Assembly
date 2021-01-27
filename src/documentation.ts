import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { P3Line, P3Document, P3LineType } from './parser';

export class P3DocumentationManager {
  instructions = new Map<string, P3DocumentationInstruction>();
  registers = new Map<string, P3DocumentationRegister>();
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  public load(): Promise<void> {
    return new Promise(async (resolve, _reject) => {
      const filePathInstructions = path.join(this.extensionPath, 'docs', 'instructions.csv');
      let buffer = fs.readFileSync(filePathInstructions, 'utf8');
      let lines = buffer.toString().split(/\r\n|\r|\n/g);
      let lineIndex = 0;
      for (let line of lines) {
        if (line.length > 0)
          try {
            let inst = new P3DocumentationInstruction(line);
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
      for (let line of lines) {
        if (line.length > 0)
          try {
            let reg = new P3DocumentationRegister(line);
            for (var alias of reg.alias) this.registers.set(alias, reg);
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
  ) {
    return new Promise<vscode.Position>((resolve) => {
      let line = document.lineAt(position.line);
      let p3Line = new P3Line(line.text, line);
      let word = document.getText(document.getWordRangeAtPosition(position)).trim();
      //if this is inside quotes, we have to ignore it
      if (p3Line.findOpeningQuote(position) >= 0) resolve();
      //we do not want to show label info on the actual label definition
      if (p3Line.lineType !== P3LineType.LABEL || !p3Line.labelRange.contains(position)) {
        let p3Document = new P3Document(document, token);
        let label = p3Document.p3Labels.get(word);
        if (label)
          resolve(label.instructionRange ? label.instructionRange.start : label.labelRange.end);
      }
      //we do not want to show label info on the actual variable definition
      if (p3Line.lineType !== P3LineType.ASSIGNMENT || !p3Line.variableRange.contains(position)) {
        let p3Document = new P3Document(document, token);
        let variable = p3Document.p3Assignments.get(word);
        if (variable) resolve(variable.valueRange.start);
      }
      resolve();
    });
  }
}

export class P3DocumentationRegister {
  name: string = '';
  description: string = '';
  alias: string[];

  constructor(inst: string) {
    let comps = inst.split(';');
    this.name = comps[0].toUpperCase();
    this.description = comps[1];
    this.alias = comps[2].split(',');
  }
}

export class P3DocumentationInstruction {
  static possibleFlags = ['Z', 'C', 'N', 'O', 'E'];

  name: string = '';
  format: string = '';
  description: string = '';
  flags: string = '';
  pseudo: boolean = false;

  constructor(inst: string) {
    let comps = inst.split(';');
    this.name = comps[0].toUpperCase();
    this.format = comps[1];
    this.description = comps[2];
    let flagmask = comps[3].toUpperCase();
    for (let flag of P3DocumentationInstruction.possibleFlags)
      if (flagmask.indexOf(flag) >= 0) this.flags += flag;
    this.pseudo = comps[4].toLowerCase() === 'true';
  }
}
