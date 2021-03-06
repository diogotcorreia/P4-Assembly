import { Position, Range, TextLine, TextDocument, CancellationToken } from 'vscode';

export enum P4LineType {
  ASSIGNMENT, // Line containing an assignment with or without comment
  //  variable operator value
  INSTRUCTION, // Line containing with or without comment and data
  // instruction data
  COMMENT, // Line containing only a comment
  // (;comment)
  LABEL, // Line containing a label with or without comment
  // label: instruction data
  OTHER,
}

export const operators = [
  'ORIG',
  'OPT',
  'ADD',
  'ADDC',
  'AND',
  'BR',
  'CLC',
  'CMC',
  'CMP',
  'COM',
  'DEC',
  'DSI',
  'ENI',
  'INC',
  'INT',
  'JAL',
  'JMP',
  'LOAD',
  'MOV',
  'MVI',
  'MVIH',
  'MVIL',
  'NEG',
  'NOP',
  'OR',
  'ROL',
  'ROLC',
  'ROR',
  'RORC',
  'RTI',
  'SHL',
  'SHLA',
  'SHR',
  'SHRA',
  'STC',
  'STOR',
  'SUB',
  'SUBB',
  'TEST',
  'XOR',
];

export class P4Line {
  static keywordsRegExps?: Array<RegExp>;
  label = '';
  instruction = '';
  data = '';
  comment = '';
  raw = '';
  start: Position;
  end: Position;
  lineNumber = -1;
  variable = '';
  operator = '';
  value = '';
  spacesBeforeLabelRange: Range;
  labelRange: Range;
  spacesLabelToInstructionRange: Range;
  instructionRange: Range;
  spacesInstructionToDataRange: Range;
  dataRange: Range;
  spacesDataToCommentRange: Range;
  commentRange: Range;
  variableRange: Range;
  operatorRange: Range;
  valueRange: Range;
  lineType: P4LineType;
  jumpInstruction = false;

  vscodeTextLine: TextLine;

  /**
   * Constructor
   * @param line Text of the line
   * @param vscodeTextLine Line for vscode
   */
  constructor(line: string, vscodeTextLine: TextLine) {
    this.lineType = P4LineType.OTHER;
    this.raw = line;
    this.vscodeTextLine = vscodeTextLine;
    this.lineNumber = vscodeTextLine.lineNumber;
    const lineNumber = this.lineNumber;
    this.start = new Position(lineNumber, 0);
    this.end = new Position(lineNumber, line.length);
    this.spacesBeforeLabelRange = new Range(
      new Position(lineNumber, 0),
      new Position(lineNumber, 0)
    );
    this.labelRange = new Range(new Position(lineNumber, 0), new Position(lineNumber, 0));
    this.spacesLabelToInstructionRange = new Range(
      new Position(lineNumber, 0),
      new Position(lineNumber, 0)
    );
    this.instructionRange = new Range(new Position(lineNumber, 0), new Position(lineNumber, 0));
    this.spacesInstructionToDataRange = new Range(
      new Position(lineNumber, 0),
      new Position(lineNumber, 0)
    );
    this.dataRange = new Range(new Position(lineNumber, 0), new Position(lineNumber, 0));
    this.spacesDataToCommentRange = new Range(
      new Position(lineNumber, 0),
      new Position(lineNumber, 0)
    );
    this.commentRange = new Range(new Position(lineNumber, 0), new Position(lineNumber, 0));
    this.variableRange = new Range(new Position(lineNumber, 0), new Position(lineNumber, 0));
    this.operatorRange = new Range(new Position(lineNumber, 0), new Position(lineNumber, 0));
    this.valueRange = new Range(new Position(lineNumber, 0), new Position(lineNumber, 0));
    if (!P4Line.keywordsRegExps?.length) {
      P4Line.keywordsRegExps = new Array<RegExp>();
      for (const op of operators) P4Line.keywordsRegExps.push(new RegExp(`(?<!\\S)${op}(?!\\S)`));
    }
    this.parse(line);
  }

  /**
   * Parse a line
   * @param line Line to parse
   */
  parse(line: string): void {
    const lineNumber = this.lineNumber;
    let l = line.trim();
    let leadingSpacesCount = line.search(/\S/);
    let current = new Position(lineNumber, 0);
    let next: Position;
    if (leadingSpacesCount < 0) leadingSpacesCount = 0;
    else {
      next = new Position(lineNumber, leadingSpacesCount);
      this.spacesBeforeLabelRange = new Range(current, next);
      current = next;
    }
    // To test the comment line the regexp needs an eol
    if (l.charAt(0) === ';') {
      this.comment = l;
      this.commentRange = new Range(
        new Position(lineNumber, leadingSpacesCount),
        new Position(lineNumber, leadingSpacesCount + l.length)
      );
      this.lineType = P4LineType.COMMENT;
    } else {
      // Extract comments
      let searchAssignmentString = line;
      let inQuotes = false;
      let commentPosInInputLine = -1;
      for (let i = 0; i < line.length; i++) {
        const c = line.charAt(i);
        if (c === "'") inQuotes = !inQuotes;
        else if (!inQuotes && c === ';') {
          commentPosInInputLine = i;
          break;
        }
      }
      if (commentPosInInputLine >= 0) {
        this.comment = line.substring(commentPosInInputLine).trim();
        searchAssignmentString = line.substring(0, commentPosInInputLine);
        l = searchAssignmentString.trim();
        this.commentRange = new Range(
          new Position(lineNumber, commentPosInInputLine),
          new Position(lineNumber, commentPosInInputLine + this.comment.length)
        );
      }
      // Find if it is an assignment
      if (this.parseAssignment(searchAssignmentString, lineNumber)) {
        this.lineType = P4LineType.ASSIGNMENT;
        return;
      }
      // find a keyword
      // remove quotes
      let searchInstructionString = l;
      let keywordIndex = 0;
      if (leadingSpacesCount === 0) {
        // Fist word must be a label
        const sPos = line.search(/\s/);
        if (sPos > 0) {
          searchInstructionString = searchInstructionString.substring(sPos);
          keywordIndex = sPos;
        }
      }
      let qPos = searchInstructionString.indexOf('"');
      if (qPos > 0) searchInstructionString = searchInstructionString.substring(0, qPos);

      qPos = searchInstructionString.indexOf("'");
      if (qPos > 0) searchInstructionString = searchInstructionString.substring(0, qPos);

      let keyword: RegExpExecArray | null = null;
      if (P4Line.keywordsRegExps)
        keyword = this.search(P4Line.keywordsRegExps, searchInstructionString);

      if (keyword) {
        // A keyword has been found
        // set the keyword
        this.lineType = P4LineType.INSTRUCTION;
        this.instruction = keyword[0];
        if (['CALL', 'JMP', 'BR'].includes(this.instruction)) this.jumpInstruction = true;

        keywordIndex += keyword.index;
        let startInInputLine = leadingSpacesCount + keywordIndex;
        const endInInputLine = startInInputLine + this.instruction.length;
        this.instructionRange = new Range(
          new Position(lineNumber, startInInputLine),
          new Position(lineNumber, endInInputLine)
        );
        if (keywordIndex > 0) {
          this.label = l.substring(0, keywordIndex).trim();
          next = new Position(lineNumber, leadingSpacesCount + this.label.length);
          this.labelRange = new Range(current, next);
          current = next;
          next = this.instructionRange.start;
          this.spacesLabelToInstructionRange = new Range(current, next);
        }
        current = this.instructionRange.end;
        const endInTrimLine = keywordIndex + keyword[0].length;
        const dataStr = l.substring(endInTrimLine);
        this.data = dataStr.trim();
        if (this.data.length > 0) {
          startInInputLine = this.instructionRange.end.character + dataStr.indexOf(this.data);
          next = new Position(lineNumber, startInInputLine);
          this.spacesInstructionToDataRange = new Range(current, next);
          current = next;
          next = new Position(lineNumber, startInInputLine + this.data.length);
          this.dataRange = new Range(current, next);
          current = next;
        }
        if (this.comment.length > 0)
          this.spacesDataToCommentRange = new Range(current, this.commentRange.start);
      }
      //label check (contains : in > 0 position and is not a comment)
      const labelEnd = line.indexOf(':');
      if (
        labelEnd > leadingSpacesCount &&
        (labelEnd < commentPosInInputLine || commentPosInInputLine < 0)
      ) {
        this.lineType = P4LineType.LABEL;
        this.label = l.substr(0, l.indexOf(':'));
        this.labelRange = new Range(
          new Position(lineNumber, leadingSpacesCount),
          new Position(lineNumber, leadingSpacesCount + this.label.length)
        );
      }
    }
  }

  /**
   * Checks the value in a list of regexp
   * @param regexps List of regexp
   * @param value Value to test
   * @return True if it as been found
   */
  test(regexps: Array<RegExp>, value: string): boolean {
    for (const regexp of regexps) if (regexp.test(value)) return true;
    return false;
  }

  /**
   * Search the first matched value in a list of regexp
   * @param regexps List of regexp
   * @param value Value to test
   * @return RegExpExecArray if found or null
   */
  search(regexps: Array<RegExp>, value: string): RegExpExecArray | null {
    let firstMatch: RegExpExecArray | null = null;
    for (const regexp of regexps) {
      const r = regexp.exec(value);
      if (r)
        if (firstMatch !== null) {
          // Which one is the first in the line
          if (r.index < firstMatch.index || r[0].length > firstMatch[0].length) firstMatch = r;
        } else firstMatch = r;
    }
    return firstMatch;
  }

  /**
   * Check if it is an assignment and parses it
   * @return true if it is an assignment
   */
  public parseAssignment(line: string, lineNumber: number): boolean {
    const regexp = /(.*)(EQU|WORD|STR|TAB)(\s+)/gi;
    const match = regexp.exec(line);
    if (match !== null) {
      this.variable = match[1].trim();
      this.operator = match[2].trim();
      this.value = line.substr(regexp.lastIndex).trim();
      this.variableRange = new Range(
        new Position(lineNumber, 0),
        new Position(lineNumber, this.variable.length)
      );
      const startPosOperator = line.indexOf(this.operator);
      const endPosOperator = startPosOperator + this.operator.length;
      this.operatorRange = new Range(
        new Position(lineNumber, startPosOperator),
        new Position(lineNumber, endPosOperator)
      );
      const startPosValue = endPosOperator + line.substring(endPosOperator).indexOf(this.value);
      const endPosValue = startPosValue + this.value.length;
      this.valueRange = new Range(
        new Position(lineNumber, startPosValue),
        new Position(lineNumber, endPosValue)
      );
      return true;
    }
    return false;
  }

  /**
   * Returns the symbol retrieved from a label.
   *
   * @return the symbol string and the range, otherwise undefined
   */
  public getSymbolFromVariable(): [string | undefined, Range | undefined] {
    if (this.variable.length > 0) return [this.variable, this.variableRange];
    return [undefined, undefined];
  }

  /**
   * Returns the registers retrieved from a data.
   *
   * @param registersRange range of registers: format R0-R7, SP, PC, RE, R11-R15
   * @return a list of registers found
   */
  public getRegistersFromData(): Array<[string, Range]> {
    const registers = new Array<[string, Range]>();
    if (this.data.length > 0) {
      const reg = /(PC|SP|RE|R[0-7]|R1[1-5])/gi;
      let match;
      while ((match = reg.exec(this.data))) {
        const register = match[1];
        const startPos = this.dataRange.start.character + match.index;
        const range = new Range(
          new Position(this.dataRange.start.line, startPos),
          new Position(this.dataRange.end.line, startPos + register.length)
        );
        registers.push([register, range]);
      }
    }
    return registers;
  }

  public findOpeningQuote(position: Position): number {
    let inQuotes = false;
    let openQuote = 0;
    for (let i = 0; i < position.character; i++) {
      const c = this.raw.charAt(i);
      if (c === "'") {
        inQuotes = !inQuotes;
        openQuote = i;
      }
    }
    if (!inQuotes) return -1;
    return openQuote;
  }
}

export class P4Document {
  private document: TextDocument;
  private token: CancellationToken | undefined;
  private range: Range | undefined;

  public p4LinesArray = new Array<P4Line>();
  public p4Labels = new Map<string, P4Line>();
  public p4Assignments = new Map<string, P4Line>();

  constructor(document: TextDocument, token?: CancellationToken, range?: Range) {
    this.document = document;
    this.token = token;
    this.range = range;
    this.parse();
  }

  public parse(): void {
    if (this.document.lineCount <= 0) return;

    if (!this.range)
      this.range = new Range(new Position(0, 0), new Position(this.document.lineCount - 1, 0));

    // Parse all the lines
    for (let i = this.range.start.line; i <= this.range.end.line; i++) {
      if (this.token && this.token.isCancellationRequested) return;

      const line = this.document.lineAt(i);
      const p4Line = new P4Line(line.text, line);
      this.p4LinesArray.push(p4Line);
      if (p4Line.lineType === P4LineType.LABEL) this.p4Labels.set(p4Line.label, p4Line);
      else if (p4Line.lineType === P4LineType.ASSIGNMENT)
        this.p4Assignments.set(p4Line.variable, p4Line);
    }
  }
}
