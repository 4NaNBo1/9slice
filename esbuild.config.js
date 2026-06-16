const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const isWatch = process.argv.includes('--watch');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = (process.env.VERSION || pkg.version).replace(/^v/, '');

function ensureDist() {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
}

const htmlInlinePlugin = {
  name: 'html-inline',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      ensureDist();

      const jsPath = path.join(root, 'dist/ui.js');
      if (!fs.existsSync(jsPath)) return;

      const js = fs.readFileSync(jsPath, 'utf8');
      const template = fs.readFileSync(path.join(root, 'src/ui.html'), 'utf8');
      const html = template.replace('<!-- SCRIPT_PLACEHOLDER -->', () => `<script>${js}</script>`);

      fs.writeFileSync(path.join(root, 'dist/ui.html'), html);
      fs.unlinkSync(jsPath);
    });
  },
};

const copyManifestsPlugin = {
  name: 'copy-manifests',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      ensureDist();

      const figmaManifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
      figmaManifest.main = './code.js';
      figmaManifest.ui = './ui.html';
      fs.writeFileSync(path.join(root, 'dist/manifest.json'), JSON.stringify(figmaManifest, null, 2));

      const masterGoManifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.mastergo.json'), 'utf8'));
      masterGoManifest.name = `${masterGoManifest.name} - v${version}`;
      masterGoManifest.main = './code.js';
      masterGoManifest.ui = './ui.html';
      fs.writeFileSync(path.join(root, 'dist/manifest.mastergo.json'), JSON.stringify(masterGoManifest, null, 2));
    });
  },
};

async function build() {
  ensureDist();

  const commonOptions = {
    bundle: true,
    minify: true,
    target: 'es2021',
    define: {
      __VERSION__: JSON.stringify(version),
    },
  };

  const sandboxContext = await esbuild.context({
    ...commonOptions,
    entryPoints: ['src/code.ts'],
    outfile: 'dist/code.js',
    format: 'iife',
    plugins: [copyManifestsPlugin],
  });

  const uiContext = await esbuild.context({
    ...commonOptions,
    entryPoints: ['src/ui.ts'],
    outfile: 'dist/ui.js',
    format: 'iife',
    platform: 'browser',
    plugins: [htmlInlinePlugin],
  });

  if (isWatch) {
    await sandboxContext.watch();
    await uiContext.watch();
    console.log('Watching for changes...');
    return;
  }

  await sandboxContext.rebuild();
  await uiContext.rebuild();
  await sandboxContext.dispose();
  await uiContext.dispose();
  console.log('Build complete.');
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
