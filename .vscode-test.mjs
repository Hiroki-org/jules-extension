import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	version: '1.113.0',
	files: 'out/test/**/*.test.js',
	launchArgs: [
		'--no-sandbox',
		'--disable-gpu',
		'--disable-extensions',
		'--enable-features=UseOzonePlatform',
		'--ozone-platform=headless',
	],
});