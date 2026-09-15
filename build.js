const esbuild = require('esbuild');
const fs = require('fs');

async function build() {
    try {
        const library = require('./scripts/build-knowledge-library').buildLibrary();
        fs.writeFileSync('data/knowledge-library.json', JSON.stringify(library, null, 2) + '\n');
        console.log(`Knowledge library: ${library.chunks.length} sections from published pages.`);
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
        console.error('Build failed:', e.message);
        process.exitCode = 1;
    }
}

build();
