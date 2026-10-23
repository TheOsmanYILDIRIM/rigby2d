import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// Python scripting runs on Pyodide, shipped with the editor: these files are served at /pyodide/
// during development and copied into the build, so scripts work offline.
const PYODIDE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
const PYODIDE_DIR = path.resolve('node_modules/pyodide');
const MIME = { '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.zip': 'application/zip', '.json': 'application/json' };

function pyodideAssets() {
  return {
    name: 'rigby-pyodide-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/pyodide\/([^?]+)/.exec(req.url ?? '');
        if (!m || !PYODIDE_FILES.includes(m[1])) return next();
        res.setHeader('Content-Type', MIME[path.extname(m[1])] ?? 'application/octet-stream');
        fs.createReadStream(path.join(PYODIDE_DIR, m[1])).pipe(res);
      });
    },
    generateBundle() {
      for (const file of PYODIDE_FILES) this.emitFile({ type: 'asset', fileName: `pyodide/${file}`, source: fs.readFileSync(path.join(PYODIDE_DIR, file)) });
    },
  };
}

// The promo studio (promo/index.html, development only) saves renders into promo/out/.
function promoSave() {
  return {
    name: 'rigby-promo-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__promo/save', (req, res) => {
        const name = path.basename(new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '');
        if (req.method !== 'POST' || !/^[\w.-]+\.(mp4|png)$/.test(name)) {
          res.statusCode = 400;
          return res.end();
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          fs.mkdirSync('promo/out', { recursive: true });
          fs.writeFileSync(path.join('promo/out', name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

// Vite serves and bundles the editor UI; Tauri hosts it in a native window.
export default defineConfig({
  clearScreen: false,
  plugins: [pyodideAssets(), promoSave()],
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2021',
    outDir: 'dist',
    emptyOutDir: true,
    // The editor and the splash screen window.
    rollupOptions: { input: { main: 'index.html', splash: 'splash.html' } },
  },
});
