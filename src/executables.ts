import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class P3Executable {
    name: string;
    globalState: vscode.Memento;
    outputChannel: vscode.OutputChannel;
    execPath: string | undefined;
    buildCall: (execPath: string, openFilePath: string) => string[];
    outputCb: ((output: string) => void) | undefined;

    static asFilePath: string | undefined;

    constructor(
        name: string,
        globalState: vscode.Memento,
        outputChannel: vscode.OutputChannel,
        buildCall: (execPath: string, openFilePath: string) => string[],
        outputCb?: (output: string) => void) {

        this.name = name;
        this.globalState = globalState;
        this.outputChannel = outputChannel;
        this.setExecPath(this.globalState.get(name));
        this.buildCall = buildCall;
        this.outputCb = outputCb;
    }

    private noPathDefinedMsg(): string {
        return 'Nenhum ' + this.name + ' definido';
    }

    private requestPathSelectionMsg(): string {
        return 'Selecionar ' + this.name + ' P4';
    }

    private selectedPathMsg(): string {
        return this.name + ' selecionado: ' + this.execPath;
    }

    private setExecPath(pathToWrite: string | undefined): void {
        this.execPath = pathToWrite;
        if(pathToWrite) {
            this.globalState.update(this.name, pathToWrite);
            fs.chmod(pathToWrite, 0o775, (err) => {
                if (err) throw err;
            });
        }
    }

    public select(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                canSelectFiles: false,
                openLabel: this.requestPathSelectionMsg(),
            };

            vscode.window.showOpenDialog(options).then((fileUri) => {
                if (fileUri && fileUri[0]) {
                    this.setExecPath(fileUri[0].fsPath.toString());
                    vscode.window.showInformationMessage(this.selectedPathMsg());
                    resolve();
                }
                else {
                    vscode.window.showWarningMessage(this.noPathDefinedMsg());
                    reject();
                }
            });
        });
    }

    private static getActiveFile(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (vscode.window.activeTextEditor) {
                let currentFile = vscode.window.activeTextEditor.document.fileName;
                if(currentFile.endsWith('.as')){
                    P3Executable.asFilePath = currentFile;
                    resolve(currentFile);
                } else 
                    resolve(P3Executable.asFilePath);
                
            } else {
                vscode.window.showWarningMessage('Nenhum ficheiro .as ativo');
                reject();
            }
        });
    }

    private checkSelectionState(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.execPath) 
                vscode.window.showWarningMessage(this.noPathDefinedMsg(), ...[this.requestPathSelectionMsg()]).then(selection => {
                    if (selection) 
                        this.select().then(resolve).catch(reject);
                    else 
                        reject();
                    
                });
            else 
                resolve();
            
        });
    }

    public run(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            P3Executable.getActiveFile().then((activeFile) => this.checkSelectionState().then(() => {
                if (this.execPath && activeFile) {
                    let execParams = this.buildCall(this.execPath, path.parse(activeFile).name);

                    child_process.execFile(execParams[0], execParams.slice(1), { cwd: path.dirname(activeFile) }, (error, stdout) => {
                        if (!this.outputCb) 
                            resolve();
                        else 
                        if (error) {
                            this.outputCb(error.message);
                            reject();
                        }
                        else {
                            this.outputCb(stdout);
                            resolve();
                        }
                        
                    });
                } else 
                    reject();
                
            }));
        });
    }
}