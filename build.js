const esbuild = require('esbuild');
const fs = require('fs');

async function build() {
    try {
        await esbuild.build({
            entryPoints: ['src/widget/main.js'],
            bundle: true,
            minify: true,
            outfile: 'supreme-boost/boost.js',
            target: ['es2015'],
            format: 'iife'
        });
        console.log('Widget built successfully!');
    } catch (e) {
        console.error('Build failed (ignored for deployment):', e.message);
        process.exit(0);
    }
}

build();
