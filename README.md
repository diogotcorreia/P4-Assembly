# About

VS Code addon providing language support for the P4 Assembly programming language, the language used in the fictitious [P4 processor](http://p4.rnl.tecnico.ulisboa.pt/), created at IST (Instituto Superior Técnico) for educational purposes.

## Known issues

- The content in the simulator only changes when you save the original file.
- You must use the simulator in split screen with the editor file, otherwise the code won't sync.

## Features

- Syntax highlighting (different themes will render different colors): recognizes all of P4's instruction mnemonics, labels and addressing modes;
- Hover documentation: put your mouse over an instruction or register to see its documentation and usage
- Constant convertion: put your mouse over a constant to see its binary, hex, decimal and ascii values.

<img src="https://raw.githubusercontent.com/guipenedo/P3-Assembly/master/media/docs%26constants.gif" width="800">

- In editor assemble and run: assemble your code with a click or mouse shortcut and launch the simulator. The extension saves your assembler and simulator selections

<img src="https://raw.githubusercontent.com/guipenedo/P3-Assembly/master/media/assembler%26simulator.gif" width="800">

- Variable declaration features: jump to constants/variables definition (right click > definition or command/control+click)

- Label declaration features: jump to a label's position on the source code (on CALL, BR and JMP instructions)

<img src="https://raw.githubusercontent.com/guipenedo/P3-Assembly/master/media/labels%26vars.gif" width="800">

## Credits

- This is a fork from the [P3 VSCode Extension](https://github.com/guipenedo/P3-Assembly) by _Guilherme Penedo_.
- The logo design was created by _António Luciano_.
- The #constants and labels definitions for the syntax were taken [from this extension](https://github.com/13xforever/x86_64-assembly-vscode).
- Borrowed heavily from [this extension](https://github.com/prb28/vscode-amiga-assembly).
- Special thanks to _José Neves_ for copy pasting all of instructions' documentation and adding in the assembler and simulator features
