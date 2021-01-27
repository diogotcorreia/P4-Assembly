/**
 * Assemble P4 Instructions.
 *
 * @requires cp437
 * @requires i18n
 *
 * @author Dinis Madeira (dinismadeira@tecnico.ulisboa.pt)
 * @author Diogo Correia (diogo.t.correia@tecnico.ulisboa.pt) - Adapted to VSCode P4 Assembly
 *
 * @version 2018
 */
'use strict';

import cp437 from './cp437';

// Mock i18n
const i18n = (strings, ...values) => {
  let text;
  if (typeof strings === 'string') text = strings;
  else {
    text = strings[0];
    for (let i = 1; i < strings.length; i++) text += '$' + i + strings[i];
  }
  return text.replace(/\$(\d)/g, (_, p1) => values[Number(p1) - 1]);
};

const opcodec = (op) => {
  const [o, c] = op.split('.');
  return opcode(o) + cond(c);
};
const opcode = (op) => assembler.opcodes[op.toLowerCase()];
//const cond = condc => condc ? assembler.condCodes[condc.toLowerCase()] : 15 << 8;
const cond = (condc) => (condc ? assembler.condCodes[condc.toLowerCase()] : 0x100);

class AssemblerError extends Error {
  constructor(message, { line, from, to }) {
    super(message);
    this.line = line;
    this.from = from;
    this.to = to;
  }
}
class ParseError extends Error {
  constructor(message, { line, from, to } = {}) {
    super(message);
    this.line = line;
    this.from = from;
    this.to = to;
  }
}
class NoMatch extends ParseError {}
class InvalidMatch extends ParseError {}

const assembler = {
  // opcodes (shifted)
  opcodes: {
    add: 0,
    sub: 0x40,
    addc: 0x80,
    subb: 0xc0,
    dec: 0x100,
    inc: 0x140,
    cmp: 0x40,
    neg: 0x40,
    com: 0x200,
    and: 0x240,
    or: 0x280,
    xor: 0x2c0,
    test: 0x240,
    shr: 0x400,
    shl: 0x440,
    shra: 0x480,
    shla: 0x4c0,
    ror: 0x500,
    rol: 0x540,
    rorc: 0x580,
    rolc: 0x5c0,
    br: 0x1000,
    call: 0x2000,
    jmp: 0x2000,
    jal: 0x3000,
    mov: 0,
    load: 0x200,
    stor: 0x300,
    mvi: 0,
    mvih: 0x200,
    mvil: 0x300,
    nop: 0,
    clc: 0x400,
    stc: 0x500,
    cmc: 0x600,
    eni: 0x400,
    dsi: 0x500,
    rti: 0x600,
    int: 0x700,
  },
  // cond codes (shifted)
  condCodes: {
    /*z: 0,
		nz: 0x100,
		c: 0x200,
		nc: 0x300,
		n: 0x400,
		nn: 0x500,
		o: 0x600,
		no: 0x700,
		p: 0x800,
		np: 0x900*/
    z: 0x200,
    nz: 0x300,
    c: 0x400,
    nc: 0x500,
    n: 0x600,
    nn: 0x700,
    o: 0x800,
    no: 0x900,
    p: 0xa00,
    np: 0xb00,
  },
  // last assembler result
  result: {},
  /**
   * Parses the given assembly instructions.
   * @param {string} code - Assembly instructions.
   */
  parse: (code) => {
    // stream variables
    const codeLines = code.split('\n');
    let line; // current line
    let codeLine; // code of current line
    let from; // current token column start
    let to; // current token column end
    let matches; // matches of last search

    // state variables
    let currentInstructionAddress = 0;
    let currentDataAddress = 0;
    let lastInstructionLabel = null; // last non-local label
    let currentInstructionLabel = null; // label for current instruction

    // options
    let charValue = (c) => {
      const n = cp437.fromChar(c);
      if (n) return n;
      addLintWarning(
        i18n`'${c}' is not a valid character in the current encoding.`,
        currentToken()
      );
      return 0;
    };
    let options = {
      DELAY_SLOTS: false, // if disabled delay slots will be automatically filled with a NOP
    };

    // result
    const result = {
      errors: [],
      stats: {
        errors: 0,
        warnings: 0,
        instructions: 0,
        pseudoInstructions: 0,
        programMemoryUsage: 0,
        dataMemoryUsage: 0,
      },
      instructions: {},
      dataInstructions: {},
      data: new Uint16Array(32768),
      debug: [],
      steps: {}, // correlate assembled code address to assembly line
    };

    const labels = {
      data: {},
      set: (label, value) => {
        if (label in labels.data) throw new ParseError(i18n`Label ${label} already defined.`);
        labels.data[label] = value;
      },
      get: (label) => labels.data[label],
      exists: (label) => label in labels.data,
    };

    const addLintWarning = (message, token = {}) => {
      result.errors.push({
        message: message,
        severity: 'warning',
        line: token.line || line,
        from: token.from || 0,
        to: token.to || 0,
      });
      ++result.stats.warnings;
    };

    const toUnsigned = (n, len) => {
      const min = -(1 << (len - 1));
      const max = (1 << len) - 1;
      if (n < min || n > max)
        throw new Error(i18n`Constant value must be between ${min} and ${max}.`, { line: line });
      return n & ((1 << len) - 1);
    };

    const formats = {
      1: (op, rc, ra, rb) => 0x8000 | (rc << 11) | opcode(op) | (ra << 3) | rb,
      2: (op, dest) => opcodec(op) | toUnsigned(dest, 8),
      3: (op, rb) => opcodec(op) | rb,
      4: (op, rc, ra, rb) => 0x4000 | (rc << 11) | opcode(op) | (ra << 3) | rb,
      '4i': (op, c) => 0x4000 | opcode(op) | toUnsigned(c, 8),
      5: (op, rc, c) => 0xc000 | (rc << 11) | opcode(op) | toUnsigned(c, 8),
    };

    const format = (op, ...args) => {
      // FORMAT 1: rc, ra, rb
      if (/^(addc?|subb?|and|x?or)$/i.test(op)) return formats[1](op, ...args); // rc, ra, rb
      if (/^(dec|inc|com|sh[rl]a?|ro[rl]c?)$/i.test(op)) return formats[1](op, args[0], args[0], 0); // rc
      if (/^(cmp|test)$/i.test(op)) return formats[1](op, 0, args[0], args[1]); // ra, rb
      if (/^neg$/i.test(op)) return formats[1](op, args[0], 0, args[0]); // rc
      // FORMAT 2: dest
      if (/^(br)(?:\.(n?[zcnop]))?$/i.test(op)) return formats[2](op, ...args); // dest
      if (/^nop$/i.test(op)) return 0; // -
      // FORMAT 3: rb
      if (/^(jmp|jal|call)(?:\.(n?[zcnop]))?$/i.test(op)) return formats[2](op, ...args); // rb
      // FORMAT 4: rc, ra, rb
      if (/^(mov|load)$/i.test(op)) return formats[4](op, args[0], 0, args[1]); // rc, rb
      if (/^stor$/i.test(op)) return formats[4](op, 0, args[1], args[0]); // rb, ra
      if (/^(eni|dsi|rti)$/i.test(op)) return formats[4](op, 0, 0, 0); // -
      if (/^(int)$/i.test(op)) return formats['4i'](op, ...args); // -
      // FORMAT 5: rc, c
      if (/^(mvi[hl]?)$/i.test(op)) return formats[5](op, ...args); // rc, c
      if (/^(stc|clc|cmc)$/i.test(op)) return formats[5](op, 0, 0); // -
    };
    const addInstruction = (instruction) => {
      if (currentInstructionAddress == 32768) throw new ParseError(i18n`End of memory reached.`);
      if (result.instructions[currentInstructionAddress] !== undefined)
        throw new ParseError(i18n`This instruction overlaps another instruction.`);
      result.instructions[currentInstructionAddress] = instruction;
      result.steps[currentInstructionAddress] = instruction.line;
      ++currentInstructionAddress;
    };
    const addDataInstruction = (instruction) => {
      if (currentDataAddress == 32768) throw new ParseError(i18n`End of memory reached.`);
      if (result.dataInstructions[currentDataAddress] !== undefined)
        throw new ParseError(i18n`Memory location already used.`);
      result.dataInstructions[currentDataAddress] = instruction;
      ++currentDataAddress;
    };
    const delaySlot = () => !options.DELAY_SLOTS && (() => format('nop'));
    const lintError = (e) => {
      if (e instanceof NoMatch)
        return { line: line, from: to, to: codeLine.length, message: e.message };
      else return { line: line, from: e.from || from, to: e.to || to, message: e.message };
    };
    // current token info to be used for error messages
    const currentToken = () => ({ line: line, from: from, to: to });
    const search = (pattern) => {
      matches = codeLine.slice(to).match(pattern);
      if (matches && matches.index == 0) {
        from = to;
        to = from + matches[0].length;
        return matches;
      } else return (matches = null);
    };

    // Searches for a register and returns the register index
    const searchRegister = () => {
      if (!search(/(?:r(\d+)|sp)\b/i)) throw new NoMatch(i18n('Expecting: $1', i18n`register`));
      let i;
      if (/sp/i.test(matches[0])) {
        addLintWarning(i18n`P4 doesn't have an SP register, replaced with R6.`, currentToken());
        i = 6;
      } else {
        i = Number(matches[1]);
        if (i > 7)
          throw new InvalidMatch(
            i18n`Invalid register index: ${i}. Only indexes from 0 to 7 are allowed.`,
            currentToken()
          );
      }
      return i;
    };

    // Searches for a constant and returns its value
    const searchConstant = () => {
      if (search(/(-?)([0-9abcdef]+h|[0-9]+[bdo]?)(?!\w)/i)) {
        const neg = matches[1];
        const m = matches[2].match(/([\dabcdef]+?)([bdho]?)$/i);
        let n = m[1];
        const b = m[2].toLowerCase() || 'd';
        if (b == 'b' && /[^01]/.test(n))
          throw new InvalidMatch(i18n`Binary constant can only contain 0 or 1.`);
        if (b == 'd' && /[^0-9]/.test(n))
          throw new InvalidMatch(i18n`Decimal constant can only contain digits from 0 to 9.`);
        if (b == 'o' && /[^0-7]/.test(n))
          throw new InvalidMatch(i18n`Octal constant can only contain digits from 0 to 7.`);
        const bases = { d: 10, b: 2, o: 8, h: 16 };
        n = parseInt(n, bases[b]);
        return n * (neg ? -1 : 1);
      }
      throw new NoMatch(i18n('Expecting: $1', i18n`constant`));
    };

    // Searches for a single character string and returns its value
    const searchChar = () => {
      const s = searchString();
      if (s.length != 1) throw new NoMatch(i18n`Constant must have exactly one character.`);
      return s[0];
    };

    // Searches for a constant or a single character string and returns its value
    const searchConstantChar = () => searchAny(searchChar, searchConstant);
    const searchAddress = () => {
      if (!search(/M/i)) throw new NoMatch(i18n('Expecting: $1', 'M'));
      if (!search(/\[/i)) throw new NoMatch(i18n('Expecting: $1', '['));
      const i = searchRegister();
      if (!search(/\]/i)) throw new NoMatch(i18n('Expecting: $1', ']'));
      return i;
    };

    // Searches for a label and returns a function that returns the value for the label
    const searchLabel = () => {
      if (!search(/(([a-z_]\w*)?\.)?([a-z_]\w*)/i))
        throw new ParseError(i18n('Expecting: $1', i18n`label`));
      const label = (matches[1] ? (matches[2] || lastInstructionLabel) + '.' : '') + matches[3];
      const options = { line: line, from: from, to: to };

      // otherwise return a function that will return the label's value
      return () => {
        if (labels.exists(label)) return labels.get(label);
        throw new AssemblerError(i18n`Undefined label: ${label}`, options);
      };
    };

    // Searches for a label and returns a function that returns the offset from the current instruction address to the value for the label
    const searchLabelRelative = () => {
      const label = searchLabel();
      const branchInstructionAddress = currentInstructionAddress;
      const options = { line: line };
      return () => {
        const offset = label() - branchInstructionAddress;
        if (offset < -128 || offset > 255)
          throw new AssemblerError(i18n`Relative branch out of reach, offset: ${offset}.`, options);
        return offset;
      };
    };

    // Searches for a single string and returns an array with the value of each character
    const searchString = () => {
      if (search(/'/)) {
        const s = [];
        while (search(/(''|[^'])/)) {
          // Search char by char so we can add warnings for specific characters
          const c = matches[0];
          if (c.length == 1) s.push(charValue(c));
          else s.push(charValue("'"));
        }
        //const s = search(/([^']|'')*/)[0].replace(/''/g, `'`);
        if (!search(/'/)) throw new NoMatch(i18n`Missing closing quote.`);
        //return s.split("").map(c => charValue(c));
        return s;
      }
      throw new NoMatch(i18n('Expecting: $1', i18n`string`));
    };

    // Searches for a single string, constant or label and returns an array with the value of each character, the constant's value, the value for the label, or a function that returns the value for the label
    const searchStringConstantLabel = () =>
      searchAny(
        () => searchString().map((n) => () => n),
        () => [functionfy(searchConstant)()],
        () => [searchLabel()]
      );

    const searchConstantLabel = () => searchAny(functionfy(searchConstantChar), searchLabel);

    const searchConstantLabelRelative = () =>
      searchAny(functionfy(searchConstantChar), searchLabelRelative);

    const searchAny = (...searches) => {
      const backtrace = { from: from, to: to };
      const errors = [];
      for (const search of searches)
        try {
          return search();
        } catch (e) {
          from = backtrace.from;
          to = backtrace.to;
          if (e instanceof InvalidMatch || !(e instanceof ParseError)) throw e;
          errors.push(e.message);
        }

      throw new NoMatch(errors.join(' ' + i18n`or` + ' '));
    };
    const matchAny = (...searches) => () => searchAny(...searches);
    // takes function f, then returns a function that gets f's result and returns a function that returns f's result
    const functionfy = (f) => () => ((r) => () => r)(f());
    //const makeSearch = (search, ...args) => () => search(...args);

    let currentArgs = []; // store argument type of last searchArguments calls
    const searchArguments = (...args) => () => {
      currentArgs = args;
      const result = [];
      search(/\s+/);
      for (let i = 0; i < args.length; i++) {
        var sep, sepToken;
        if (i) {
          sep = search(/\s*,\s*|\s+/);
          sepToken = currentToken();
        }
        const arg = args[i]();
        if (i && !/,/.test(sep)) addLintWarning(i18n`Arguments must be separated by a: ,`);

        result[i] = arg;
      }
      return result;
    };
    let clearLabel;
    const parseOperation = (op, parameters, instruction) => {
      clearLabel = true;
      const args = parameters ? parameters() : [];
      const result = instruction ? instruction(...args) : (...args) => format(op, ...args);
      if (Array.isArray(result))
        for (instruction of result)
          if (instruction) addInstruction({ instruction: instruction, args: args, line: line });
          else addInstruction({ instruction: result, args: args, line: line });
      return true;
    };
    const operationParsers = {};
    const addOperationParsers = (instructions, parser) => {
      for (const instruction of instructions) operationParsers[instruction] = parser;
    };
    addOperationParsers(['add', 'addc', 'sub', 'subb', 'and', 'or', 'xor'], (op) =>
      parseOperation(
        op,
        matchAny(
          searchArguments(searchRegister, searchRegister, searchRegister),
          searchArguments(searchRegister, searchRegister)
        ), // make last parameter optional
        (rc, ra, rb) => {
          if (rb != undefined) return () => format(op, rc, ra, rb);
          addLintWarning(
            i18n(
              'This instruction must have 3 parameters, replaced with: $1.',
              `${op.toUpperCase()} R${rc}, R${rc}, R${ra}`
            )
          );
          return () => format(op, rc, rc, ra);
        }
      )
    );
    addOperationParsers(
      ['dec', 'inc', 'com', 'shr', 'shra', 'shl', 'shla', 'ror', 'rorc', 'rol', 'rolc'],
      (op) =>
        parseOperation(
          op,
          matchAny(
            searchArguments(searchRegister, searchConstantChar),
            searchArguments(searchRegister)
          ),
          (rc, c) => {
            if (c == undefined) return () => format(op, rc);
            if (c > 16) throw new ParseError(i18n`Constant cannot be higher than 16.`);
            if (c < 1) throw new ParseError(i18n`Constant cannot be less than 1.`);
            addLintWarning(
              i18n(
                "This instruction doesn't accept a second parameter, replaced with: $1.",
                `${op.toUpperCase()} R${rc} (x${c})`
              )
            );
            return new Array(c).fill(() => format(op, rc));
          }
        )
    );
    addOperationParsers(['cmp', 'test'], (op) =>
      parseOperation(op, searchArguments(searchRegister, searchRegister))
    );
    addOperationParsers(['neg'], (op) => parseOperation(op, searchArguments(searchRegister)));
    addOperationParsers(['mov'], (op) =>
      parseOperation(
        op,
        matchAny(
          searchArguments(searchRegister, searchRegister),
          searchArguments(searchRegister, searchAddress),
          searchArguments(searchAddress, searchRegister),
          searchArguments(searchRegister, searchConstantLabel)
        ),
        (rc, rb) => {
          if (currentArgs[0] == searchRegister) {
            if (currentArgs[1] == searchRegister) return () => format(op, rc, rb);
            if (currentArgs[1] == searchAddress) {
              addLintWarning(
                i18n('This is not a P4 operation, replaced with: $1.', `LOAD R${rc}, M[R${rb}]`)
              );
              return () => format('load', rc, rb);
            }
            addLintWarning(
              i18n('This is not a P4 operation, replaced with: $1.', `MVI R${rc}, const`)
            );
            return [() => format('mvih', rc, rb() >> 8), () => format('mvil', rc, rb() & 255)];
          }
          addLintWarning(
            i18n('This is not a P4 operation, replaced with: $1.', `STOR M[R${rc}], R${rb}`)
          );
          return () => format('stor', rc, rb);
        }
      )
    );
    addOperationParsers(['load'], (op) =>
      parseOperation(op, searchArguments(searchRegister, searchAddress))
    );
    addOperationParsers(['stor'], (op) =>
      parseOperation(op, searchArguments(searchAddress, searchRegister))
    );
    addOperationParsers(['mvi', 'mvih', 'mvil'], (op) =>
      parseOperation(
        op,
        searchArguments(searchRegister, matchAny(searchConstantChar, searchLabel)),
        (rc, c) => {
          if (Number.isInteger(c)) {
            if (/^mvi$/i.test(op) && (c > 255 || c < 0))
              return [() => format('mvih', rc, c >> 8), () => format('mvil', rc, c & 255)];
            return () => format(op, rc, c);
          } else {
            if (/^mvi$/i.test(op))
              return [() => format('mvih', rc, c() >> 8), () => format('mvil', rc, c() & 255)];
            return () => format(op, rc, c());
          }
        }
      )
    );
    addOperationParsers(['stc', 'clc', 'cmc', 'eni', 'dsi', 'nop'], (op) => parseOperation(op));
    addOperationParsers(['rti'], (op) =>
      parseOperation(op, null, () => [() => format('rti'), delaySlot()])
    );
    addOperationParsers(['int'], (op) =>
      parseOperation(op, searchArguments(searchConstantLabel), () => [
        (c) => format('int', c()),
        delaySlot(),
      ])
    );
    addOperationParsers(['push'], (op) =>
      parseOperation(op, searchArguments(searchRegister), (ra) => {
        addLintWarning(
          i18n('This is not a P4 operation, replaced with: $1.', `STOR M[R6], R${ra}; DEC R6`)
        );
        return [() => format('stor', 6, ra), () => format('dec', 6)];
      })
    );
    addOperationParsers(['pop'], (op) =>
      parseOperation(op, searchArguments(searchRegister), (rc) => {
        addLintWarning(
          i18n('This is not a P4 operation, replaced with: $1.', `INC R6; STOR M[R6], R${rc}`)
        );
        return [() => format('inc', 6), () => format('load', rc, 6)];
      })
    );
    addOperationParsers(['ret'], (op) =>
      parseOperation(op, null, () => {
        addLintWarning(
          i18n('This is not a P4 operation, replaced with: $1.', 'INC R6; LOAD R7, M[R6]; JMP R7')
        );
        return [
          () => format('inc', 6),
          () => format('load', 7, 6),
          () => format('jmp', 7),
          delaySlot(),
        ];
      })
    );
    addOperationParsers(['retn'], (op) =>
      parseOperation(op, searchArguments(searchConstantChar), (c) => {
        addLintWarning(
          i18n(
            'This is not a P4 operation, replaced with: $1.',
            'INC R6; LOAD R7, M[R6]; INC R6 (x'
          ) +
            c +
            '); JMP R7.'
        );
        const instructions = [];
        instructions.push(() => format('inc', 6));
        instructions.push(() => format('load', 7, 6));
        for (let i = 0; i < c; i++) instructions.push(() => format('inc', 6));

        instructions.push(() => format('jmp', 7));
        instructions.push(delaySlot());
        return instructions;
      })
    );
    const searchOperation = () => {
      if (search(/[a-z_][\w\.]*/i)) {
        const op = matches[0];
        const PC = currentInstructionAddress;
        clearLabel = false;
        const parser = operationParsers[op.toLowerCase()];
        if (parser) parser(op);
        else if (/^(br)(?:\.(n?[zcnop]))?$/i.test(op))
          parseOperation(op, searchArguments(searchConstantLabelRelative), () => [
            (d) => format(op, d()),
            delaySlot(),
          ]);
        else if (/^(jmp|jal)(?:\.(n?[zcnop]))?$/i.test(op))
          parseOperation(op, searchArguments(matchAny(searchRegister, searchLabel)), (rb) => {
            if (Number.isInteger(rb)) return [(rb) => format(op, rb), delaySlot()];
            return [
              () => format('mvih', 7, rb() >>> 8),
              () => format('mvil', 7, rb() & 255),
              () => format(op, 7),
              delaySlot(),
            ];
          });
        else if (/^call(?:\.(n?[zcnop]))?$/i.test(op))
          parseOperation(op, searchArguments(matchAny(searchRegister, searchLabel)), (rb) => {
            addLintWarning(
              i18n(
                'This is not a P4 operation, replaced with: $1.',
                'MVI R7, PC; STOR M[R6], R7; DEC R6; JMP dest'
              )
            );
            if (Number.isInteger(rb)) return [(rb) => format(op, rb), delaySlot()];
            return [
              () => format('mvih', 7, (PC + 8) >>> 8),
              () => format('mvil', 7, (PC + 8) & 255),
              () => format('stor', 6, 7),
              () => format('dec', 6),
              () => format('mvih', 7, rb() >>> 8),
              () => format('mvil', 7, rb() & 255),
              () => format(op, 7),
              delaySlot(),
            ];
          });
        else if (/^orig$/i.test(op)) {
          ++result.stats.pseudoInstructions;
          if (currentInstructionLabel)
            throw new ParseError(i18n`Pseudo-instructions cannot have labels.`);
          let c;
          if (!search(/\s+/) || isNaN((c = searchConstantChar())))
            throw new ParseError(i18n('Expecting: $1', i18n`constant`));
          if (c < 0) throw new ParseError(i18n`Address must be positive.`);
          if (c > 65535) throw new ParseError(i18n`Address must be below 65535.`);
          currentDataAddress = currentInstructionAddress = c & 32767; // addresses only have 15 bits (MSB is ignored)
        } else if (/^opt$/i.test(op)) {
          ++result.stats.pseudoInstructions;
          if (currentInstructionLabel)
            throw new ParseError(i18n`Pseudo-instructions cannot have labels.`);
          if (search(/\s+/) && search(/[\w\-]+/)) {
            const option = matches[0];
            if (/^ENABLE_DELAY_SLOTS$/i.test(option)) options.DELAY_SLOTS = true;
            else if (/^DISABLE_DELAY_SLOTS$/i.test(option)) options.DELAY_SLOTS = false;
            else if (/^ASCII$/i.test(option)) charValue = cp437.fromChar;
            else if (/^(UTF-?16|UNICODE)$/i.test(option)) charValue = (c) => c.charCodeAt(0);
            else throw new InvalidMatch(i18n`${option.toUpperCase()} isn't a recognized option.`);
          } else throw new ParseError(i18n`No option.`);
        } else if (search(/\s+([a-z_][\w]*)/i)) {
          ++result.stats.pseudoInstructions;
          const pseudoInstruction = matches[1];
          if (/^(equ|word|tab)$/i.test(pseudoInstruction)) {
            if (currentInstructionLabel)
              throw new ParseError(i18n`Pseudo-instructions cannot have labels.`);
            if (/^equ$/i.test(pseudoInstruction)) {
              const c = search(/\s+/) && searchConstantChar();
              if (isNaN(c)) throw new ParseError(i18n('Expecting: $1', i18n`constant`));
              if (c < -32768 || c > 65536)
                throw new InvalidMatch(
                  i18n`Constant value must be between ${-32768} and ${65536}.`
                );
              labels.set(op, c);
            } else {
              const c = search(/\s+/) && searchConstantLabel();
              if (!c) throw new ParseError(i18n('Expecting: $1', i18n`constant`));
              labels.set(op, currentDataAddress);
              if (/^word$/i.test(pseudoInstruction)) addDataInstruction(c);
              else if (/^tab$/i.test(pseudoInstruction))
                for (let i = 0; i < c(); i++) addDataInstruction(() => 0);
            }
          } else if (/^str$/i.test(pseudoInstruction)) {
            ++result.stats.pseudoInstructions;
            if (currentInstructionLabel)
              throw new ParseError(i18n`Pseudo-instructions cannot have labels.`);
            labels.set(op, currentDataAddress);
            const s = search(/\s+/) && searchStringConstantLabel();
            if (!s)
              throw new ParseError(
                i18n('Expecting: $1', i18n`string` + ' ' + i18n`or` + ' ' + i18n`constant`)
              );
            while (search(/\s*,\s*/)) s.push(...searchStringConstantLabel());

            for (const c of s) addDataInstruction(c);
          } else throw new InvalidMatch(i18n`${op.toUpperCase()} isn't an operation.`);
        } else if (currentInstructionLabel)
          throw new InvalidMatch(i18n`${op.toUpperCase()} isn't an operation.`);
        else throw new InvalidMatch(i18n('Expecting: $1', `EQU, WORD, STR ${i18n`or`} TAB`));

        if (clearLabel) currentInstructionLabel = null; // matched an instruction, clear label
      } else if (!search(/$/))
        throw new NoMatch(i18n`Names must begin with a letter or underscore.`);
    };

    const parseLine = () => {
      search(/\s+/); // eat space
      if (search(/;/)) return; // comments
      if (search(/(\.)?([^\s]+):/)) {
        // label
        if (currentInstructionLabel)
          throw new InvalidMatch(i18n`Unexpected label, expecting instruction for previous label.`);
        // Local Label
        if (matches[1]) {
          if (!lastInstructionLabel)
            throw new ParseError(i18n`Local labels must be under a non-local label.`);
          currentInstructionLabel = lastInstructionLabel + '.' + matches[2];
        }
        // Non-local Label
        else lastInstructionLabel = currentInstructionLabel = matches[2];
        if (/^[0-9]/.test(matches[2]))
          throw new InvalidMatch(i18n`Labels may not begin with a number.`);
        if (!/^\w+$/.test(matches[2]))
          throw new InvalidMatch(i18n`Labels may only contain letters, numbers and underscores.`);
        labels.set(currentInstructionLabel, currentInstructionAddress);
        search(/\s+/); // eat space
        if (search(/;/)) return; // comments
        searchOperation();
      } else searchOperation();
      search(/\s+/); // eat space
      if (search(/;/)) return; // comments
      if (search(/.+/)) addLintWarning(i18n`Unexpected input.`, currentToken());
    };

    // parse
    for (line = 0; line < codeLines.length; line++)
      try {
        codeLine = codeLines[line];
        result.debug[line] = { code: codeLine, errors: [], assembly: [] };
        from = to = 0;
        parseLine();
      } catch (e) {
        if (e instanceof ParseError) result.errors.push(lintError(e));
        else throw e;
      }

    result.labels = labels.data;
    return result;
  },
  /**
   * Assembles the given assembly instructions.
   * @param {string} code - Assembly instructions.
   */
  assemble: (code) => {
    const result = assembler.parse(code);
    result.assembly = {};
    result.program = new Uint16Array(32768);
    const lintError = (e) => ({
      line: e.line,
      from: e.from || 0,
      to: e.to || 80,
      message: e.message,
    });
    const handleError = (e, instruction) => {
      if (e instanceof AssemblerError) result.errors.push(lintError(e));
      //console.error(e);
      else throw e;
    };
    for (const i in result.instructions) {
      const instruction = result.instructions[i];
      if (instruction)
        try {
          const assembly = (result.program[i] = result.assembly[i] = instruction.instruction(
            ...instruction.args
          ));
          result.debug[instruction.line].assembly.push({ addr: Number(i), data: assembly });
        } catch (e) {
          handleError(e, instruction);
        }
    }
    for (const i in result.dataInstructions) {
      const instruction = result.dataInstructions[i];
      try {
        result.data[i] = instruction();
      } catch (e) {
        handleError(e);
      }
    }
    assembler.result = result;
    result.stats.errors = result.errors.length - result.stats.warnings;
    result.stats.instructions = result.stats.programMemoryUsage = Object.keys(
      result.instructions
    ).length;
    result.stats.dataMemoryUsage = Object.keys(result.dataInstructions).length;
    return result;
  },
};

export default assembler;
