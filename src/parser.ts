import { Position, Range, TextLine, TextDocument, CancellationToken } from 'vscode';

export enum P3LineType {
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
  'ADD',
  'ADDC',
  'AND',
  'BR',
  'CALL',
  'CLC',
  'CMC',
  'CMP',
  'COM',
  'DEC',
  'DIV',
  'DSI',
  'ENI',
  'INC',
  'INT',
  'JMP',
  'MOV',
  'MUL',
  'MVBH',
  'MVBL',
  'NEG',
  'NOP',
  'OR',
  'POP',
  'PUSH',
  'RET',
  'RETN',
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
  'SUB',
  'SUBB',
  'TEST',
  'XCH',
  'XOR',
];

export class P3Line {
  static keywordsRegExps?: Array<RegExp>;
  label: string = '';
  instruction: string = '';
  data: string = '';
  comment: string = '';
  raw: string = '';
  start: Position;
  end: Position;
  variable: string = '';
  operator: string = '';
  value: string = '';
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
  lineType: P3LineType;
  jumpInstruction: boolean = false;

  vscodeTextLine: TextLine;

  /**
   * Constructor
   * @param line Text of the line
   * @param vscodeTextLine Line for vscode
   */
  constructor(line: string, vscodeTextLine: TextLine) {
    this.lineType = P3LineType.OTHER;
    this.raw = line;
    this.vscodeTextLine = vscodeTextLine;
    let lineNumber = vscodeTextLine.lineNumber;
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
    if (!P3Line.keywordsRegExps?.length) {
      P3Line.keywordsRegExps = new Array<RegExp>();
      for (let op of operators) P3Line.keywordsRegExps.push(new RegExp(op));
    }
    this.parse(line, lineNumber);
  }

  /**
   * Parse a line
   * @param line Line to parse
   * @param lineNumber index of the line in document
   */
  parse(line: string, lineNumber: number) {
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
      this.lineType = P3LineType.COMMENT;
    } else {
      // Extract comments
      let searchAssignmentString = line;
      let inQuotes = false;
      let commentPosInInputLine = -1;
      for (let i = 0; i < line.length; i++) {
        let c = line.charAt(i);
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
        this.lineType = P3LineType.ASSIGNMENT;
        return;
      }
      // find a keyword
      // remove quotes
      let searchInstructionString = l;
      let keywordIndex = 0;
      if (leadingSpacesCount === 0) {
        // Fist word must be a label
        let sPos = line.search(/\s/);
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
      if (P3Line.keywordsRegExps)
        keyword = this.search(P3Line.keywordsRegExps, searchInstructionString);

      if (keyword) {
        // A keyword has been found
        // set the keyword
        this.lineType = P3LineType.INSTRUCTION;
        this.instruction = keyword[0];
        if (['CALL', 'JMP', 'BR'].includes(this.instruction)) this.jumpInstruction = true;

        keywordIndex += keyword.index;
        let startInInputLine = leadingSpacesCount + keywordIndex;
        let endInInputLine = startInInputLine + this.instruction.length;
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
        let endInTrimLine = keywordIndex + keyword[0].length;
        let dataStr = l.substring(endInTrimLine);
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

        //label check (contains : in > 0 position and is not a comment)
        let labelEnd = line.indexOf(':');
        if (
          labelEnd > leadingSpacesCount &&
          (labelEnd < commentPosInInputLine || commentPosInInputLine < 0)
        ) {
          this.lineType = P3LineType.LABEL;
          this.label = l.substr(0, l.indexOf(':'));
          this.labelRange = new Range(
            new Position(lineNumber, leadingSpacesCount),
            new Position(lineNumber, leadingSpacesCount + this.label.length)
          );
        }
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
    for (let regexp of regexps) if (regexp.test(value)) return true;
    return false;
  }

  /**
   * Search the first matched value in a list of regexp
   * @param regexps List of regexp
   * @param value Value to test
   * @return RegExpExecArray if found or null
   */
  search(regexps: Array<RegExp>, value: string): RegExpExecArray | null {
    let firstMatch: any | null = null;
    for (let regexp of regexps) {
      let r = regexp.exec(value);
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
    let regexp = /(.*)(EQU|WORD|STR|TAB)(\s+)/gi;
    let match = regexp.exec(line);
    if (match !== null) {
      this.variable = match[1].trim();
      this.operator = match[2].trim();
      this.value = line.substr(regexp.lastIndex).trim();
      this.variableRange = new Range(
        new Position(lineNumber, 0),
        new Position(lineNumber, this.variable.length)
      );
      let startPosOperator = line.indexOf(this.operator);
      let endPosOperator = startPosOperator + this.operator.length;
      this.operatorRange = new Range(
        new Position(lineNumber, startPosOperator),
        new Position(lineNumber, endPosOperator)
      );
      let startPosValue = endPosOperator + line.substring(endPosOperator).indexOf(this.value);
      let endPosValue = startPosValue + this.value.length;
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
    let registers = new Array<[string, Range]>();
    if (this.data.length > 0) {
      let reg = /(PC|SP|RE|R[0-7]|R1[1-5])/gi;
      let match;
      while ((match = reg.exec(this.data))) {
        let register = match[1];
        let startPos = this.dataRange.start.character + match.index;
        let range = new Range(
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
      let c = this.raw.charAt(i);
      if (c === "'") {
        inQuotes = !inQuotes;
        openQuote = i;
      }
    }
    if (!inQuotes) return -1;
    return openQuote;
  }
}

export class P3Document {
  private document: TextDocument;
  private token: CancellationToken | undefined;
  private range: Range | undefined;

  public p3LinesArray = new Array<P3Line>();
  public p3Labels = new Map<string, P3Line>();
  public p3Assignments = new Map<string, P3Line>();

  constructor(document: TextDocument, token?: CancellationToken, range?: Range) {
    this.document = document;
    this.token = token;
    this.range = range;
    this.parse();
  }

  public parse() {
    if (this.document.lineCount <= 0) return;

    if (!this.range)
      this.range = new Range(new Position(0, 0), new Position(this.document.lineCount - 1, 0));

    // Parse all the lines
    for (let i = this.range.start.line; i <= this.range.end.line; i++) {
      if (this.token && this.token.isCancellationRequested) return;

      const line = this.document.lineAt(i);
      let p3Line = new P3Line(line.text, line);
      this.p3LinesArray.push(p3Line);
      if (p3Line.lineType === P3LineType.LABEL) this.p3Labels.set(p3Line.label, p3Line);
      else if (p3Line.lineType === P3LineType.ASSIGNMENT)
        this.p3Assignments.set(p3Line.variable, p3Line);
    }
  }
}
