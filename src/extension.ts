import * as vscode from 'vscode';
import {P3HoverProvider} from './hover';
import {P3DocumentationManager} from './documentation';
import * as path from 'path';
import { P3DefinitionProvider } from './definition';
import { P3SymbolProvider } from './symbols';
import { P3Executable } from './executables';

export async function activate(context: vscode.ExtensionContext) {
    state.setExtensionPath(context.extensionPath);

    await state.getDocumentationManager().then((docManager) => {
        context.subscriptions.push(vscode.languages.registerHoverProvider('p4', new P3HoverProvider(docManager)));
        context.subscriptions.push(vscode.languages.registerDefinitionProvider('p4', new P3DefinitionProvider(docManager)));
    });

    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider('p4', new P3SymbolProvider()));

    //assemble and simulate commands
    let outputChannel = vscode.window.createOutputChannel('P4');

    let assembler = new P3Executable('Assembler', context.globalState, outputChannel, (execPath: string, openFileBaseName: string) => {
        return [execPath, openFileBaseName + '.as'];
    }, output => {
        outputChannel.clear();
        outputChannel.append(output);
        outputChannel.show();
    });

    let simulator = new P3Executable('Simulador', context.globalState, outputChannel, (execPath: string, openFileBaseName: string) => {
        return ['java', '-jar', execPath, openFileBaseName + '.exe'];
    });

    context.subscriptions.push(vscode.commands.registerCommand('extension.setAssembler', () => assembler.select()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.setSimulator', () => simulator.select()));

    context.subscriptions.push(vscode.commands.registerCommand('extension.runAssembler', () => {
        assembler.run();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('extension.runAssembler&Simulator', () => {
        assembler.run().then(() => simulator.run());
    }));
}

export function deactivate() {}

export class ExtensionState {
	private documentationManager: P3DocumentationManager | undefined;
	private extensionPath: string = path.join(__dirname, '..');

	public getDocumentationManager(): Promise<P3DocumentationManager> {
	    return new Promise(async (resolve, _reject) => {
	        if (this.documentationManager === undefined) {
	            this.documentationManager = new P3DocumentationManager(this.extensionPath);
	            await this.documentationManager.load();
	        }
	        resolve(this.documentationManager);
	    });
	}
	
	public setExtensionPath(extensionPath: string) {
	    this.extensionPath = extensionPath;
	}
}

const state = new ExtensionState();