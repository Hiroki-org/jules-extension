import * as vscode from 'vscode';

// Initialize with dummy to support usage before activate (e.g. in tests)
export let logChannel: vscode.OutputChannel = {
    name: 'Jules Logs (Fallback)',
    append: (val: string) => console.log(val),
    appendLine: (val: string) => console.log(val),
    replace: (val: string) => console.log(val),
    clear: () => { },
    show: () => { },
    hide: () => { },
    dispose: () => { }
};

export function setLogChannel(channel: vscode.OutputChannel) {
    logChannel = channel;
}
