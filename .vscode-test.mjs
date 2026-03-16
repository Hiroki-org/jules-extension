import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { defineConfig } from '@vscode/test-cli';

function findExecutableFromCommand(command) {
	try {
		const lookupCommand = process.platform === 'win32' ? 'where.exe' : 'which';
		const output = execFileSync(lookupCommand, [command], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		const candidate = output
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean);

		return candidate && existsSync(candidate) ? candidate : undefined;
	} catch {
		return undefined;
	}
}

function resolveVSCodeExecutablePath() {
	const candidates = [];

	if (process.platform === 'darwin') {
		candidates.push(
			'/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
			'/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron',
			join(process.env.HOME ?? '', 'Applications/Visual Studio Code.app/Contents/MacOS/Electron'),
			join(process.env.HOME ?? '', 'Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron'),
		);
	} else if (process.platform === 'win32') {
		const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
		const localAppData = process.env.LOCALAPPDATA ?? '';
		candidates.push(
			join(programFiles, 'Microsoft VS Code', 'Code.exe'),
			join(programFiles, 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
			localAppData ? join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe') : '',
			localAppData ? join(localAppData, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe') : '',
		);
	} else {
		candidates.push(
			'/usr/bin/code',
			'/usr/bin/code-insiders',
			'/usr/share/code/code',
			'/snap/bin/code',
		);
	}

	const fromKnownPath = candidates.find((candidate) => candidate && existsSync(candidate));
	if (fromKnownPath) {
		return fromKnownPath;
	}

	return findExecutableFromCommand('code') ?? findExecutableFromCommand('code-insiders');
}

const vscodeExecutablePath = resolveVSCodeExecutablePath();

export default defineConfig({
	files: 'out/test/**/*.test.js',
	useInstallation: vscodeExecutablePath ? { fromPath: vscodeExecutablePath } : undefined,
	download: {
		timeout: 60000,
	},
	launchArgs: [
		'--no-sandbox',
		'--disable-gpu',
		'--disable-extensions',
		'--enable-features=UseOzonePlatform',
		'--ozone-platform=headless',
	],
});
