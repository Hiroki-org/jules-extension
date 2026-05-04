const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

const copyDomPurifyPlugin = {
	name: 'copy-dompurify',

	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length > 0) {
				return;
			}
			try {
				const sourcePath = require.resolve('dompurify/dist/purify.min.js');
				const targetPath = path.join(__dirname, 'dist', 'purify.min.js');
				fs.mkdirSync(path.dirname(targetPath), { recursive: true });
				const source = fs
					.readFileSync(sourcePath, 'utf8')
					.replace(/\n?\/\/# sourceMappingURL=purify\.min\.js\.map\s*$/, '');
				fs.writeFileSync(targetPath, source);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error('[copy-dompurify] Failed to copy purify.min.js:', message);
				throw err;
			}
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		metafile: true,
		plugins: [
			copyDomPurifyPlugin,
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		const result = await ctx.rebuild();
		if (result.metafile) {
			require('fs').writeFileSync('dist/metafile.json', JSON.stringify(result.metafile));
		}
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
