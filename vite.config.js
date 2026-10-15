import { defineConfig } from 'vite';

// Vite serves and bundles the editor UI; Tauri hosts it in a native window.
export default defineConfig({
  clearScreen: false,
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
