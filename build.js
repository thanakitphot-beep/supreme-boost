const esbuild = require('esbuild');

async function build(outfile = 'supreme-boost/boost.js') {
    try {
        await esbuild.build({
            entryPoints: ['src/widget/main.js'],
            bundle: true,
            minify: true,
            outfile,
            target: ['es2015'],
            format: 'iife'
        });
        console.log('Widget built successfully!');
    } catch (e) {
        console.error('Build failed:', e.message);
        process.exitCode = 1;
    }
}

if (require.main === module) build();

module.exports = build;
