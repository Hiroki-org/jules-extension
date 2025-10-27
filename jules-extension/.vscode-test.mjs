import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	launchArgs: ['--no-sandbox', '--headless=new', '--disable-gpu'],
});