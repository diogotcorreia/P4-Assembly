import * as vscode from 'vscode';
import {
  P4DocumentationManager,
  P4DocumentationInstruction,
  P4DocumentationRegister,
} from './documentation';
import { P4Line } from './parser';

/**
 * Hover provider class
 */
export class P4HoverProvider implements vscode.HoverProvider {
  documentationManager: P4DocumentationManager;

  constructor(documentationManager: P4DocumentationManager) {
    this.documentationManager = documentationManager;
  }

  /**
   * Main hover function
   * @param document Document to be formatted
   * @param position Mouse position
   * @param token
   * @return Hover results
   */
  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null | undefined> {
    const defPosition = await this.documentationManager.findDefinition(document, position, token);
    const line = document.lineAt(position.line);
    const p4Line = new P4Line(line.text, line);
    if (token.isCancellationRequested) return;

    // start by looking for an actual definition (variable/label)
    if (defPosition !== null) {
      const msg = new vscode.MarkdownString();
      msg.appendCodeblock(document.lineAt(defPosition.line).text);
      msg.appendMarkdown('**ctrl+click** para *saltar* (**cmd+click** no macOS)');
      return new vscode.Hover(msg);
    }

    //now we're looking for documented instructions
    // extract operand from instruction or assignment
    let op;
    if (
      p4Line.instructionRange &&
      p4Line.instructionRange.contains(position) &&
      p4Line.instruction.length > 0
    )
      op = p4Line.instruction;
    else if (
      p4Line.operatorRange &&
      p4Line.operatorRange.contains(position) &&
      p4Line.operator.length > 0
    )
      op = p4Line.operator;

    if (op) {
      //remove jump conditions
      if (op.indexOf('.') >= 0) op = op.substr(0, op.indexOf('.'));
      //if this is indeed an instruction
      const inst = this.documentationManager.instructions.get(op);
      if (inst) return new vscode.Hover(this.renderInstruction(inst));
    }

    // registers and constants
    if (p4Line.dataRange && p4Line.dataRange.contains(position)) {
      const registers = p4Line.getRegistersFromData();
      for (const reg of registers) {
        const register = this.documentationManager.registers.get(reg[0]);
        if (reg[1] && reg[1].contains(position) && register)
          return new vscode.Hover(this.renderRegister(register));
      }
      return this.parseConstant(document, position);
    } else if (p4Line.valueRange && p4Line.valueRange.contains(position))
      return this.parseConstant(document, position);
  }

  public async parseConstant(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null | undefined> {
    const values = new Array<number>();

    const line = document.lineAt(position.line);
    const p4Line = new P4Line(line.text, line);

    const openQuote = p4Line.findOpeningQuote(position);

    //if in quotes
    if (openQuote >= 0) {
      if (line.text.indexOf("'", openQuote + 1) >= 0) {
        const constant = line.text.substring(openQuote + 1, line.text.indexOf("'", openQuote + 1));
        for (let c = 0; c < constant.length; c++) {
          const code = constant.codePointAt(c);
          if (code) values.push(code);
        }
      }
    }
    //otherwise look for numbers
    else {
      const constant = document.getText(document.getWordRangeAtPosition(position));
      if (!constant) return;
      let numValue;

      //check binary
      if (RegExp('[0-1]+b').test(constant)) numValue = parseInt(constant, 2);
      //check octal
      else if (RegExp('[0-7]+o').test(constant)) numValue = parseInt(constant, 8);
      //check hex
      else if (RegExp('[0-9A-Fa-f]{1,4}h').test(constant))
        numValue = parseInt(constant.substr(0, constant.length - 1), 16);
      //check decimal
      else if (RegExp('^-?[0-9]+').test(constant)) numValue = parseInt(constant);

      if (numValue !== undefined && !isNaN(numValue)) {
        if (numValue >= 0 && numValue & 0x8000)
          // isto é um numero negativo pa, toca a converter
          numValue -= 65536;
        values.push(numValue);
      }
    }

    if (values.length) return new vscode.Hover(this.renderConstants(values));
  }

  public renderConstants(values: Array<number>): Array<vscode.MarkdownString> {
    const rendered = new Array<vscode.MarkdownString>();
    for (const c of values) {
      const complement = c < 0 ? c + 65536 : c;
      const line =
        '**Dec**: ' +
        c +
        ' | **Hex**: ' +
        complement.toString(16).toUpperCase().padStart(4, '0') +
        'h' +
        (isNaN(c) || c < 0 || c >= 0x10ffff ? '' : ' | **Char**: ' + String.fromCodePoint(c)) +
        ' | **Bin**: ' +
        complement.toString(2) +
        'b';
      rendered.push(new vscode.MarkdownString(line));
    }
    return rendered;
  }

  public renderRegister(reg: P4DocumentationRegister): Array<vscode.MarkdownString> {
    const rendered = new Array<vscode.MarkdownString>();
    rendered.push(
      new vscode.MarkdownString(
        'Register **' +
          reg.name +
          '** ' +
          (reg.alias.length ? '(' + reg.alias.join(', ') + ')' : '')
      )
    );
    rendered.push(new vscode.MarkdownString(reg.description));
    return rendered;
  }

  public renderInstruction(inst: P4DocumentationInstruction): Array<vscode.MarkdownString> {
    const rendered = new Array<vscode.MarkdownString>();
    const top =
      '**' +
      inst.name +
      '**' +
      (inst.pseudo ? ' (Pseudo-instrução)' : '') +
      ': *' +
      inst.format +
      '*';
    rendered.push(new vscode.MarkdownString(top));
    if (inst.flags) {
      const flags = '**Flags**: ' + inst.flags;
      rendered.push(new vscode.MarkdownString(flags));
    }
    rendered.push(new vscode.MarkdownString(inst.description));
    return rendered;
  }
}
