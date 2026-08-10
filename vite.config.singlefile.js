import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Produces a single self-contained dist/index.html (all JS/CSS/images inlined)
// that runs by just opening the file — no server. Build with:
//   VITE_SINGLEFILE=1 npx vite build --config vite.config.singlefile.js
export default defineConfig({
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    outDir: 'dist-single',
  },
})
